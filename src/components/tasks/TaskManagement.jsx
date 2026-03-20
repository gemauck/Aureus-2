const { useEffect, useMemo, useState, useCallback } = React;
const storage = window.storage;

const STATUS_OPTIONS = [
  { id: 'todo', label: 'To do', icon: 'fa-circle', color: 'slate' },
  { id: 'in-progress', label: 'In progress', icon: 'fa-spinner', color: 'amber' },
  { id: 'completed', label: 'Completed', icon: 'fa-check-circle', color: 'emerald' },
  { id: 'cancelled', label: 'Cancelled', icon: 'fa-ban', color: 'rose' }
];

const PRIORITY_OPTIONS = [
  { id: 'low', label: 'Low', ring: 'ring-slate-400/40' },
  { id: 'medium', label: 'Medium', ring: 'ring-blue-400/40' },
  { id: 'high', label: 'High', ring: 'ring-amber-400/50' },
  { id: 'urgent', label: 'Urgent', ring: 'ring-red-500/50' }
];

const SORT_OPTIONS = [
  { id: 'due', label: 'Due date' },
  { id: 'priority', label: 'Priority' },
  { id: 'updated', label: 'Recently updated' },
  { id: 'title', label: 'Title (A–Z)' }
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

const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };

const parseDue = (task) => {
  if (!task?.dueDate) return null;
  const d = new Date(task.dueDate);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** @returns {'none'|'overdue'|'today'|'upcoming'|'done'} */
const getDueBucket = (task) => {
  const st = normalizeStatus(task.status);
  if (st === 'completed' || st === 'cancelled') return 'done';
  const d = parseDue(task);
  if (!d) return 'none';
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const t = d.getTime();
  if (t < start.getTime()) return 'overdue';
  if (t >= start.getTime() && t < end.getTime()) return 'today';
  return 'upcoming';
};

const formatDueShort = (task) => {
  const d = parseDue(task);
  if (!d) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
};

const checklistProgress = (task) => {
  const list = Array.isArray(task.checklist) ? task.checklist : [];
  if (list.length === 0) return { done: 0, total: 0, pct: 0 };
  const done = list.filter((i) => i.completed).length;
  return { done, total: list.length, pct: Math.round((done / list.length) * 100) };
};

const emptyTaskForm = {
  title: '',
  description: '',
  status: 'todo',
  priority: 'medium',
  category: '',
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
  const [filterDue, setFilterDue] = useState('all');
  const [listSort, setListSort] = useState('due');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());

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
        if (status === 'completed') acc.completed += 1;
        const b = getDueBucket(task);
        if (b === 'overdue') acc.overdue += 1;
        return acc;
      },
      { total: 0, completed: 0, overdue: 0 }
    );
  }, [tasks]);

  const completionRate = useMemo(() => {
    if (stats.total === 0) return 0;
    return Math.round((stats.completed / stats.total) * 100);
  }, [stats]);

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((task) => {
      if (filterStatus !== 'all' && normalizeStatus(task.status) !== filterStatus) return false;
      if (filterPriority !== 'all' && String(task.priority || '').toLowerCase() !== filterPriority) return false;
      if (filterListId !== 'all' && String(task.listId || '') !== String(filterListId)) return false;
      if (filterTagId !== 'all' && !task.tags.some((tag) => String(tag.id) === String(filterTagId))) return false;
      if (filterDue !== 'all') {
        const b = getDueBucket(task);
        if (filterDue === 'no-date' && parseDue(task)) return false;
        if (filterDue === 'overdue' && b !== 'overdue') return false;
        if (filterDue === 'today' && b !== 'today') return false;
        if (filterDue === 'upcoming' && b !== 'upcoming') return false;
      }
      if (!q) return true;
      return (
        String(task.title || '').toLowerCase().includes(q) ||
        String(task.description || '').toLowerCase().includes(q) ||
        String(task.category || '').toLowerCase().includes(q)
      );
    });
  }, [tasks, search, filterStatus, filterPriority, filterListId, filterTagId, filterDue]);

  const sortedListTasks = useMemo(() => {
    const arr = [...filteredTasks];
    const pri = (t) => priorityOrder[String(t.priority || 'medium').toLowerCase()] ?? 2;
    arr.sort((a, b) => {
      if (listSort === 'title') return String(a.title || '').localeCompare(String(b.title || ''));
      if (listSort === 'priority') return pri(a) - pri(b);
      if (listSort === 'updated') {
        const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return tb - ta;
      }
      const da = parseDue(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const db = parseDue(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return da - db;
    });
    return arr;
  }, [filteredTasks, listSort]);

  const kanbanColumns = useMemo(() => {
    return lists.map((list) => ({
      list,
      items: filteredTasks.filter((task) => String(task.listId || '') === String(list.id))
    }));
  }, [lists, filteredTasks]);

  const calendarCells = useMemo(() => {
    const y = calendarMonth.getFullYear();
    const m = calendarMonth.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const startPad = first.getDay();
    const daysInMonth = last.getDate();
    const cells = [];
    for (let i = 0; i < startPad; i++) cells.push({ day: null, tasks: [] });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(y, m, d);
      const dayTasks = tasks.filter((t) => {
        const pd = parseDue(t);
        if (!pd) return false;
        return pd.getFullYear() === y && pd.getMonth() === m && pd.getDate() === d;
      });
      cells.push({ day: d, date, tasks: dayTasks });
    }
    return cells;
  }, [calendarMonth, tasks]);

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
      await Promise.all(reordered.map((list, index) => updateList(list.id, { order: index })));
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
    const tags = Array.isArray(task.tags) ? task.tags : [];
    setTaskForm({
      title: task.title || '',
      description: task.description || '',
      status: normalizeStatus(task.status),
      priority: task.priority || 'medium',
      category: task.category || '',
      dueDate: task.dueDate ? String(task.dueDate).slice(0, 16) : '',
      listId: task.listId || '',
      tagIds: tags.map((tag) => tag.id),
      checklist: Array.isArray(task.checklist) ? task.checklist : [],
      newChecklistItem: ''
    });
    setShowTaskModal(true);
  };

  const openEditTaskRef = React.useRef(openEditTask);
  const tasksRef = React.useRef(tasks);
  const loadingRef = React.useRef(loading);
  const pendingOpenUserTaskIdRef = React.useRef(null);
  const lastHandledUserTaskSegmentRef = React.useRef(null);

  React.useEffect(() => {
    openEditTaskRef.current = openEditTask;
    tasksRef.current = tasks;
    loadingRef.current = loading;
  });

  const resumePendingUserTaskOpen = useCallback(() => {
    const id = pendingOpenUserTaskIdRef.current;
    if (!id || !token) return;
    const local = tasksRef.current.find((t) => String(t.id) === id);
    if (local) {
      openEditTaskRef.current(local);
      pendingOpenUserTaskIdRef.current = null;
      lastHandledUserTaskSegmentRef.current = id;
      return;
    }
    if (loadingRef.current) return;
    (async () => {
      try {
        const response = await fetch(`/api/user-tasks/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) {
          pendingOpenUserTaskIdRef.current = null;
          return;
        }
        const payload = await response.json();
        const fetched = payload?.data?.task;
        if (!fetched) {
          pendingOpenUserTaskIdRef.current = null;
          return;
        }
        const normalized = {
          ...fetched,
          status: normalizeStatus(fetched.status),
          tags: Array.isArray(fetched.tags) ? fetched.tags : [],
          checklist: Array.isArray(fetched.checklist) ? fetched.checklist : []
        };
        openEditTaskRef.current(normalized);
        pendingOpenUserTaskIdRef.current = null;
        lastHandledUserTaskSegmentRef.current = id;
      } catch (e) {
        console.error('resumePendingUserTaskOpen', e);
        pendingOpenUserTaskIdRef.current = null;
      }
    })();
  }, [token]);

  useEffect(() => {
    const handler = (e) => {
      const d = e.detail;
      if (!d || String(d.entityType || '').toLowerCase() !== 'usertask' || !d.entityId) return;
      pendingOpenUserTaskIdRef.current = String(d.entityId);
      resumePendingUserTaskOpen();
    };
    window.addEventListener('openEntityDetail', handler);
    return () => window.removeEventListener('openEntityDetail', handler);
  }, [resumePendingUserTaskOpen]);

  useEffect(() => {
    const syncFromRoute = (route) => {
      if (!route || route.page !== 'my-tasks') return;
      if (!route.segments?.[0]) {
        lastHandledUserTaskSegmentRef.current = null;
        return;
      }
      const seg = String(route.segments[0]);
      if (lastHandledUserTaskSegmentRef.current === seg) return;
      pendingOpenUserTaskIdRef.current = seg;
      resumePendingUserTaskOpen();
    };
    syncFromRoute(window.RouteState?.getRoute?.());
    const unsub = window.RouteState?.subscribe?.(syncFromRoute);
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [resumePendingUserTaskOpen]);

  useEffect(() => {
    resumePendingUserTaskOpen();
  }, [tasks, loading, resumePendingUserTaskOpen]);

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
        category: String(taskForm.category || '').trim(),
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
    setFilterDue('all');
  };

  const shiftCalendarMonth = (delta) => {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const dueBadgeClass = (task) => {
    const b = getDueBucket(task);
    if (b === 'overdue') return isDark ? 'bg-rose-900/50 text-rose-200 border border-rose-700/50' : 'bg-rose-50 text-rose-800 border border-rose-200';
    if (b === 'today') return isDark ? 'bg-amber-900/40 text-amber-100 border border-amber-700/50' : 'bg-amber-50 text-amber-900 border border-amber-200';
    if (b === 'upcoming' && parseDue(task)) return isDark ? 'bg-slate-700/80 text-slate-200 border border-slate-600' : 'bg-slate-100 text-slate-700 border border-slate-200';
    return '';
  };

  const priorityPillClass = (p) => {
    const id = String(p || 'medium').toLowerCase();
    if (id === 'urgent') return isDark ? 'bg-red-950/60 text-red-200' : 'bg-red-100 text-red-800';
    if (id === 'high') return isDark ? 'bg-orange-950/50 text-orange-200' : 'bg-orange-100 text-orange-800';
    if (id === 'low') return isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600';
    return isDark ? 'bg-blue-950/40 text-blue-200' : 'bg-blue-50 text-blue-800';
  };

  const TaskCard = ({ task, accentColor }) => {
    const cp = checklistProgress(task);
    const due = formatDueShort(task);
    const dueB = getDueBucket(task);
    return (
      <div
        draggable
        onDragStart={(e) => e.dataTransfer.setData('taskId', String(task.id))}
        className={`group rounded-xl border p-3 shadow-sm transition hover:shadow-md ${isDark ? 'bg-gray-800/90 border-gray-600/80 hover:border-gray-500' : 'bg-white border-gray-200/90 hover:border-gray-300'}`}
        style={accentColor ? { borderLeftWidth: 3, borderLeftColor: accentColor } : undefined}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openEditTask(task);
              }}
              className={`font-semibold leading-snug text-left w-full rounded-lg -m-0.5 p-0.5 transition ${isDark ? 'text-white hover:bg-white/10' : 'text-gray-900 hover:bg-slate-100'} ${normalizeStatus(task.status) === 'completed' ? 'line-through opacity-70' : ''}`}
            >
              {task.title}
            </button>
            {task.category ? <p className={`text-[11px] mt-0.5 uppercase tracking-wide ${isDark ? 'text-indigo-300' : 'text-indigo-600'}`}>{task.category}</p> : null}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${priorityPillClass(task.priority)}`}>{task.priority || 'medium'}</span>
              {due ? (
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${dueBadgeClass(task) || (isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600')}`}>
                  <i className="far fa-calendar-alt" />
                  {dueB === 'overdue' ? 'Overdue · ' : dueB === 'today' ? 'Today · ' : ''}
                  {due}
                </span>
              ) : null}
            </div>
            {task.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1 mt-2">
                {task.tags.slice(0, 4).map((tag) => (
                  <span key={tag.id} className="text-[10px] px-1.5 py-0.5 rounded-md text-white shadow-sm" style={{ backgroundColor: tag.color || '#3B82F6' }}>
                    {tag.name}
                  </span>
                ))}
              </div>
            ) : null}
            {cp.total > 0 ? (
              <div className="mt-2">
                <div className={`flex justify-between text-[10px] mb-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  <span>Checklist</span>
                  <span>{cp.done}/{cp.total}</span>
                </div>
                <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`}>
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all" style={{ width: `${cp.pct}%` }} />
                </div>
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-1 shrink-0 opacity-80 group-hover:opacity-100">
            <button type="button" onClick={() => toggleTaskCompletion(task)} className={`p-1.5 rounded-lg ${normalizeStatus(task.status) === 'completed' ? 'text-emerald-400' : 'text-gray-400 hover:text-emerald-400'}`} title="Toggle complete">
              <i className="fas fa-check-circle" />
            </button>
            <button type="button" onClick={() => openEditTask(task)} className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-500/10" title="Edit"><i className="fas fa-pen" /></button>
            <button type="button" onClick={() => deleteTask(task.id)} className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10" title="Delete"><i className="fas fa-trash-alt" /></button>
          </div>
        </div>
      </div>
    );
  };

  const shell = isDark ? 'min-h-[calc(100vh-4rem)]' : 'min-h-[calc(100vh-4rem)]';

  return (
    <div className={`${shell} ${isDark ? 'bg-[#0c0f14]' : 'bg-gradient-to-b from-slate-50 via-white to-slate-100'}`}>
      <div className={`relative overflow-hidden border-b ${isDark ? 'border-gray-800 bg-gradient-to-br from-slate-900 via-[#111827] to-slate-900' : 'border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-indigo-50/40'}`}>
        <div className="absolute inset-0 opacity-[0.07] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)', backgroundSize: '24px 24px' }} />
        <div className="relative max-w-[1600px] mx-auto px-4 md:px-8 py-8 md:py-10">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-3 border bg-white/5 border-white/10 text-indigo-200">
                <i className="fas fa-layer-group text-indigo-300" />
                Workspace
              </div>
              <h1 className={`text-3xl md:text-4xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>Task workspace</h1>
              <p className={`mt-2 text-sm md:text-base max-w-xl ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Organize work across lists, track due dates, tags, and checklists — all in one place.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <div className={`text-xs px-3 py-1.5 rounded-lg border ${isDark ? 'border-emerald-800/50 bg-emerald-950/30 text-emerald-300' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
                  <i className="fas fa-chart-line mr-1.5" />
                  {completionRate}% completed
                </div>
                {stats.overdue > 0 ? (
                  <div className={`text-xs px-3 py-1.5 rounded-lg border ${isDark ? 'border-rose-800/50 bg-rose-950/30 text-rose-300' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
                    <i className="fas fa-exclamation-circle mr-1.5" />
                    {stats.overdue} overdue
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => refresh()} className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition ${isDark ? 'border-slate-600 bg-slate-800/80 text-slate-200 hover:bg-slate-700' : 'border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50'}`}>
                <i className={`fas fa-sync-alt ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button type="button" onClick={openCreateList} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-indigo-500/25 hover:from-violet-500 hover:to-indigo-500">
                <i className="fas fa-columns" />
                New list
              </button>
              <button type="button" onClick={openCreateTask} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-blue-500/25 hover:from-sky-400 hover:to-blue-500">
                <i className="fas fa-plus" />
                New task
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-6 space-y-6">
        <div className={`rounded-2xl border shadow-sm p-4 md:p-5 ${isDark ? 'border-gray-700/80 bg-gray-900/40 backdrop-blur' : 'border-slate-200/90 bg-white/80 backdrop-blur'}`}>
          <div className="flex flex-col xl:flex-row xl:items-center gap-4 mb-4">
            <div className="relative flex-1 min-w-0">
              <i className={`fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-sm ${isDark ? 'text-gray-500' : 'text-slate-400'}`} />
              <input
                type="text"
                placeholder="Search tasks, notes, categories..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm ${isDark ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-500' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'}`}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { mode: 'kanban', icon: 'fa-columns', label: 'Board' },
                { mode: 'list', icon: 'fa-list', label: 'Table' },
                { mode: 'calendar', icon: 'fa-calendar-alt', label: 'Calendar' }
              ].map((v) => (
                <button
                  key={v.mode}
                  type="button"
                  onClick={() => setViewMode(v.mode)}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition ${
                    viewMode === v.mode
                      ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md'
                      : isDark
                        ? 'bg-gray-800 text-gray-300 border border-gray-600 hover:bg-gray-700'
                        : 'bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200/80'
                  }`}
                >
                  <i className={`fas ${v.icon}`} />
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={`px-3 py-2 rounded-xl border text-sm ${isDark ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
              <option value="all">All statuses</option>
              {STATUS_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className={`px-3 py-2 rounded-xl border text-sm ${isDark ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
              <option value="all">All priorities</option>
              {PRIORITY_OPTIONS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <select value={filterListId} onChange={(e) => setFilterListId(e.target.value)} className={`px-3 py-2 rounded-xl border text-sm ${isDark ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
              <option value="all">All lists</option>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <select value={filterTagId} onChange={(e) => setFilterTagId(e.target.value)} className={`px-3 py-2 rounded-xl border text-sm ${isDark ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
              <option value="all">All tags</option>
              {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select value={filterDue} onChange={(e) => setFilterDue(e.target.value)} className={`px-3 py-2 rounded-xl border text-sm ${isDark ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
              <option value="all">Any due</option>
              <option value="overdue">Overdue</option>
              <option value="today">Due today</option>
              <option value="upcoming">Upcoming</option>
              <option value="no-date">No due date</option>
            </select>
            {viewMode === 'list' ? (
              <select value={listSort} onChange={(e) => setListSort(e.target.value)} className={`px-3 py-2 rounded-xl border text-sm ${isDark ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
                {SORT_OPTIONS.map((s) => <option key={s.id} value={s.id}>Sort: {s.label}</option>)}
              </select>
            ) : (
              <button type="button" onClick={clearFilters} className={`px-3 py-2 rounded-xl border text-sm font-medium ${isDark ? 'border-gray-600 text-gray-300 hover:bg-gray-800' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                Clear filters
              </button>
            )}
          </div>
          {viewMode === 'list' ? (
            <div className="mt-3 flex justify-end">
              <button type="button" onClick={clearFilters} className={`text-xs font-medium ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>
                Reset all filters
              </button>
            </div>
          ) : null}
        </div>

        {error ? (
          <div className={`rounded-xl border px-4 py-3 text-sm flex items-center gap-2 ${isDark ? 'border-rose-900 bg-rose-950/40 text-rose-200' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
            <i className="fas fa-exclamation-triangle" />
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className={`rounded-2xl border p-4 h-64 ${isDark ? 'border-gray-700 bg-gray-900/50' : 'border-slate-200 bg-white'}`}>
                <div className={`h-4 w-1/3 rounded ${isDark ? 'bg-gray-700' : 'bg-slate-200'}`} />
                <div className={`mt-4 h-20 rounded-xl ${isDark ? 'bg-gray-800' : 'bg-slate-100'}`} />
                <div className={`mt-3 h-20 rounded-xl ${isDark ? 'bg-gray-800' : 'bg-slate-100'}`} />
              </div>
            ))}
          </div>
        ) : viewMode === 'kanban' ? (
          lists.length === 0 ? (
            <div className={`text-center py-20 rounded-2xl border border-dashed ${isDark ? 'border-gray-600 bg-gray-900/30' : 'border-slate-300 bg-slate-50'}`}>
              <div className={`inline-flex h-16 w-16 items-center justify-center rounded-2xl mb-4 ${isDark ? 'bg-gray-800' : 'bg-white shadow'}`}>
                <i className="fas fa-columns text-2xl text-indigo-400" />
              </div>
              <p className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-slate-800'}`}>Create your first list</p>
              <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>Lists are columns on your board — add one to start organizing tasks.</p>
              <button type="button" onClick={openCreateList} className="mt-6 px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-500">Create list</button>
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-4 -mx-1 px-1 scrollbar-thin">
              {kanbanColumns.map(({ list, items }) => (
                <div
                  key={list.id}
                  className={`flex-shrink-0 w-[min(100%,320px)] rounded-2xl border shadow-sm flex flex-col max-h-[calc(100vh-12rem)] ${isDark ? 'border-gray-700 bg-gray-900/50' : 'border-slate-200/90 bg-white'}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const taskId = e.dataTransfer.getData('taskId');
                    const task = tasks.find((t) => String(t.id) === String(taskId));
                    if (task) moveTask(task, list);
                  }}
                >
                  <div
                    className="px-4 py-3 border-b rounded-t-2xl flex items-center justify-between gap-2"
                    style={{ borderBottomColor: list.color ? `${list.color}40` : undefined, background: list.color ? (isDark ? `linear-gradient(135deg, ${list.color}22, transparent)` : `linear-gradient(135deg, ${list.color}18, transparent)`) : undefined }}
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-white/30" style={{ backgroundColor: list.color || '#6366f1' }} />
                      <div>
                        <h3 className={`font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{list.name || 'Unnamed'}</h3>
                        <p className={`text-[11px] ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>{statusLabel(normalizeStatus(list.status))}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={`text-xs font-bold tabular-nums px-2 py-0.5 rounded-lg ${isDark ? 'bg-gray-800 text-gray-300' : 'bg-slate-100 text-slate-700'}`}>{items.length}</span>
                      <button type="button" onClick={() => reorderList(list.id, -1)} className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-slate-100 text-slate-500'}`} title="Move left"><i className="fas fa-chevron-left text-xs" /></button>
                      <button type="button" onClick={() => reorderList(list.id, 1)} className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-slate-100 text-slate-500'}`} title="Move right"><i className="fas fa-chevron-right text-xs" /></button>
                      <button type="button" onClick={() => openEditList(list)} className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-gray-800 text-indigo-400' : 'hover:bg-slate-100 text-indigo-600'}`} title="Edit"><i className="fas fa-sliders-h text-xs" /></button>
                      <button type="button" onClick={() => deleteList(list.id)} className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-gray-800 text-rose-400' : 'hover:bg-slate-100 text-rose-600'}`} title="Delete"><i className="fas fa-trash-alt text-xs" /></button>
                    </div>
                  </div>
                  <div className="p-3 space-y-2 overflow-y-auto flex-1">
                    {items.map((task) => (
                      <TaskCard key={task.id} task={task} accentColor={list.color} />
                    ))}
                    {items.length === 0 ? (
                      <p className={`text-center text-xs py-8 ${isDark ? 'text-gray-500' : 'text-slate-400'}`}>Drop tasks here or create a new task.</p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : viewMode === 'list' ? (
          <div className={`rounded-2xl border overflow-hidden shadow-sm ${isDark ? 'border-gray-700 bg-gray-900/40' : 'border-slate-200 bg-white'}`}>
            <div className={`overflow-x-auto`}>
              <table className="w-full text-sm min-w-[800px]">
                <thead className={isDark ? 'bg-gray-950/80 text-gray-300' : 'bg-slate-50 text-slate-600'}>
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">Task</th>
                    <th className="text-left px-4 py-3 font-semibold">List</th>
                    <th className="text-left px-4 py-3 font-semibold">Due</th>
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                    <th className="text-left px-4 py-3 font-semibold">Priority</th>
                    <th className="text-left px-4 py-3 font-semibold">Tags</th>
                    <th className="text-right px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedListTasks.map((task) => {
                    const list = lists.find((l) => String(l.id) === String(task.listId));
                    const due = formatDueShort(task);
                    return (
                      <tr key={task.id} className={`border-t transition ${isDark ? 'border-gray-800 hover:bg-gray-800/50' : 'border-slate-100 hover:bg-slate-50/80'}`}>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => openEditTask(task)}
                            className={`font-medium text-left rounded-lg -m-0.5 p-0.5 transition hover:underline ${isDark ? 'text-white hover:bg-white/10' : 'text-slate-900 hover:bg-slate-100'}`}
                          >
                            {task.title}
                          </button>
                          {task.category ? <span className={`ml-2 text-[10px] uppercase tracking-wide ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>{task.category}</span> : null}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: list?.color || '#94a3b8' }} />
                            {list?.name || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {due ? <span className={`text-xs font-medium px-2 py-0.5 rounded-lg ${dueBadgeClass(task) || (isDark ? 'bg-gray-800 text-gray-300' : 'bg-slate-100 text-slate-600')}`}>{due}</span> : <span className="text-gray-500">—</span>}
                        </td>
                        <td className="px-4 py-3">{statusLabel(normalizeStatus(task.status))}</td>
                        <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${priorityPillClass(task.priority)}`}>{task.priority || 'medium'}</span></td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {task.tags.slice(0, 3).map((tag) => (
                              <span key={tag.id} className="text-[10px] px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: tag.color || '#3B82F6' }}>{tag.name}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button type="button" onClick={() => toggleTaskCompletion(task)} className={`p-2 rounded-lg mr-1 ${normalizeStatus(task.status) === 'completed' ? 'text-emerald-400' : 'text-gray-400 hover:text-emerald-400'}`}><i className="fas fa-check-circle" /></button>
                          <button type="button" onClick={() => openEditTask(task)} className="p-2 rounded-lg text-blue-400 hover:bg-blue-500/10 mr-1"><i className="fas fa-pen" /></button>
                          <button type="button" onClick={() => deleteTask(task.id)} className="p-2 rounded-lg text-rose-400 hover:bg-rose-500/10"><i className="fas fa-trash-alt" /></button>
                        </td>
                      </tr>
                    );
                  })}
                  {sortedListTasks.length === 0 ? (
                    <tr>
                      <td colSpan={7} className={`px-4 py-16 text-center ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>
                        <i className="fas fa-search text-3xl mb-3 opacity-40" />
                        <p className="font-medium">No tasks match your filters</p>
                        <button type="button" onClick={clearFilters} className="mt-3 text-indigo-500 hover:underline text-sm">Clear filters</button>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className={`rounded-2xl border p-4 md:p-6 shadow-sm ${isDark ? 'border-gray-700 bg-gray-900/40' : 'border-slate-200 bg-white'}`}>
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
              </h3>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => shiftCalendarMonth(-1)} className={`p-2 rounded-xl border ${isDark ? 'border-gray-600 hover:bg-gray-800' : 'border-slate-200 hover:bg-slate-50'}`}><i className="fas fa-chevron-left" /></button>
                <button type="button" onClick={() => setCalendarMonth(new Date())} className={`px-3 py-2 rounded-xl text-sm font-medium border ${isDark ? 'border-gray-600 text-gray-300' : 'border-slate-200 text-slate-700'}`}>Today</button>
                <button type="button" onClick={() => shiftCalendarMonth(1)} className={`p-2 rounded-xl border ${isDark ? 'border-gray-600 hover:bg-gray-800' : 'border-slate-200 hover:bg-slate-50'}`}><i className="fas fa-chevron-right" /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide mb-2 opacity-70">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calendarCells.map((cell, idx) => (
                <div
                  key={idx}
                  className={`min-h-[100px] rounded-xl border p-1.5 text-left ${cell.day == null ? 'border-transparent bg-transparent' : isDark ? 'border-gray-700/60 bg-gray-950/30' : 'border-slate-100 bg-slate-50/50'}`}
                >
                  {cell.day != null ? (
                    <>
                      <div className={`text-xs font-bold mb-1 ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>{cell.day}</div>
                      <div className="space-y-1 max-h-[72px] overflow-y-auto">
                        {cell.tasks.slice(0, 3).map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => openEditTask(t)}
                            className={`w-full text-left text-[10px] px-1.5 py-0.5 rounded truncate border ${isDark ? 'border-gray-600 bg-gray-800 text-gray-200' : 'border-slate-200 bg-white text-slate-800 shadow-sm'}`}
                          >
                            {t.title}
                          </button>
                        ))}
                        {cell.tasks.length > 3 ? <p className="text-[9px] text-center opacity-60">+{cell.tasks.length - 3}</p> : null}
                      </div>
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap justify-between items-center gap-3 pt-2 border-t border-dashed border-gray-700/50">
          <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-slate-400'}`}>
            <i className="fas fa-info-circle mr-1" />
            Project tasks are not shown here — only your personal user tasks.
          </p>
          <button type="button" onClick={deleteAllLists} className="text-xs font-medium text-rose-500 hover:text-rose-400">
            Delete all lists
          </button>
        </div>
      </div>

      {showTaskModal ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className={`w-full max-w-2xl rounded-2xl border shadow-2xl max-h-[92vh] overflow-hidden flex flex-col ${isDark ? 'border-gray-600 bg-gray-900' : 'border-slate-200 bg-white'}`}>
            <div className={`px-6 py-4 border-b flex items-center justify-between ${isDark ? 'border-gray-700 bg-gradient-to-r from-indigo-900/40 to-slate-900' : 'border-slate-100 bg-gradient-to-r from-indigo-50 to-white'}`}>
              <div>
                <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{editingTaskId ? 'Edit task' : 'New task'}</h3>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>Details sync to your account</p>
              </div>
              <button type="button" onClick={() => setShowTaskModal(false)} className={`p-2 rounded-xl ${isDark ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-slate-100 text-slate-500'}`}><i className="fas fa-times" /></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              <input type="text" value={taskForm.title} onChange={(e) => setTaskForm((p) => ({ ...p, title: e.target.value }))} placeholder="Task title *" className={`w-full px-4 py-3 rounded-xl border text-base font-medium ${isDark ? 'bg-gray-800 border-gray-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} />
              <textarea value={taskForm.description} onChange={(e) => setTaskForm((p) => ({ ...p, description: e.target.value }))} rows={4} placeholder="Description, notes, links..." className={`w-full px-4 py-3 rounded-xl border text-sm ${isDark ? 'bg-gray-800 border-gray-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`} />
              <input type="text" value={taskForm.category} onChange={(e) => setTaskForm((p) => ({ ...p, category: e.target.value }))} placeholder="Category (optional)" className={`w-full px-4 py-2.5 rounded-xl border text-sm ${isDark ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-slate-200 text-slate-800'}`} />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select value={taskForm.status} onChange={(e) => setTaskForm((p) => ({ ...p, status: e.target.value }))} className={`px-4 py-2.5 rounded-xl border text-sm ${isDark ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
                  {STATUS_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                <select value={taskForm.priority} onChange={(e) => setTaskForm((p) => ({ ...p, priority: e.target.value }))} className={`px-4 py-2.5 rounded-xl border text-sm ${isDark ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
                  {PRIORITY_OPTIONS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
                <select value={taskForm.listId} onChange={(e) => setTaskForm((p) => ({ ...p, listId: e.target.value }))} className={`px-4 py-2.5 rounded-xl border text-sm ${isDark ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
                  <option value="">No list</option>
                  {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <input type="datetime-local" value={taskForm.dueDate} onChange={(e) => setTaskForm((p) => ({ ...p, dueDate: e.target.value }))} className={`px-4 py-2.5 rounded-xl border text-sm ${isDark ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-slate-200 text-slate-800'}`} />
              </div>

              <div className={`rounded-xl border p-4 ${isDark ? 'border-gray-600 bg-gray-800/50' : 'border-slate-200 bg-slate-50/80'}`}>
                <p className={`text-sm font-semibold mb-3 ${isDark ? 'text-gray-200' : 'text-slate-800'}`}>Tags</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {tags.map((tag) => (
                    <label key={tag.id} className="inline-flex items-center gap-2 cursor-pointer text-xs">
                      <input type="checkbox" checked={taskForm.tagIds.includes(tag.id)} onChange={(e) => toggleTag(tag.id, e.target.checked)} className="rounded border-gray-500" />
                      <span className="px-2.5 py-1 rounded-lg text-white font-medium shadow-sm" style={{ backgroundColor: tag.color || '#3B82F6' }}>{tag.name}</span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <input type="text" value={newTagName} onChange={(e) => setNewTagName(e.target.value)} placeholder="New tag" className={`flex-1 min-w-[120px] px-3 py-2 rounded-xl border text-sm ${isDark ? 'bg-gray-700 border-gray-500 text-white' : 'bg-white border-slate-200'}`} />
                  <input type="color" value={newTagColor} onChange={(e) => setNewTagColor(e.target.value)} className="h-10 w-14 rounded-xl border cursor-pointer" />
                  <button type="button" onClick={createTag} className="px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-500">Create tag</button>
                </div>
              </div>

              <div className={`rounded-xl border p-4 ${isDark ? 'border-gray-600 bg-gray-800/50' : 'border-slate-200 bg-slate-50/80'}`}>
                <p className={`text-sm font-semibold mb-3 ${isDark ? 'text-gray-200' : 'text-slate-800'}`}>Checklist</p>
                <div className="space-y-2 mb-3">
                  {taskForm.checklist.map((item) => (
                    <div key={item.id} className="flex items-center gap-2">
                      <input type="checkbox" checked={Boolean(item.completed)} onChange={() => toggleChecklistItem(item.id)} className="rounded" />
                      <span className={`text-sm flex-1 ${item.completed ? 'line-through opacity-60' : ''}`}>{item.text}</span>
                      <button type="button" onClick={() => removeChecklistItem(item.id)} className="text-rose-400 p-1"><i className="fas fa-times" /></button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={taskForm.newChecklistItem}
                    onChange={(e) => setTaskForm((prev) => ({ ...prev, newChecklistItem: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addChecklistItem(); } }}
                    placeholder="Add item, press Enter"
                    className={`flex-1 px-3 py-2 rounded-xl border text-sm ${isDark ? 'bg-gray-700 border-gray-500 text-white' : 'bg-white border-slate-200'}`}
                  />
                  <button type="button" onClick={addChecklistItem} className="px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-medium">Add</button>
                </div>
              </div>
            </div>
            <div className={`px-6 py-4 border-t flex justify-end gap-3 ${isDark ? 'border-gray-700 bg-gray-950/50' : 'border-slate-100 bg-slate-50/80'}`}>
              <button type="button" onClick={() => setShowTaskModal(false)} className={`px-5 py-2.5 rounded-xl text-sm font-medium ${isDark ? 'bg-gray-800 text-gray-200' : 'bg-white border border-slate-200 text-slate-700'}`}>Cancel</button>
              <button type="button" disabled={saving} onClick={saveTask} className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg disabled:opacity-50">
                {saving ? 'Saving...' : 'Save task'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showListModal ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden ${isDark ? 'border-gray-600 bg-gray-900' : 'border-slate-200 bg-white'}`}>
            <div className={`px-6 py-4 border-b ${isDark ? 'border-gray-700 bg-violet-950/30' : 'border-slate-100 bg-violet-50/50'}`}>
              <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{editingListId ? 'Edit list' : 'New list'}</h3>
            </div>
            <div className="p-6 space-y-4">
              <input type="text" value={listForm.name} onChange={(e) => setListForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="List name" className={`w-full px-4 py-3 rounded-xl border ${isDark ? 'bg-gray-800 border-gray-600 text-white' : 'bg-slate-50 border-slate-200'}`} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>Accent</label>
                  <input type="color" value={listForm.color} onChange={(e) => setListForm((prev) => ({ ...prev, color: e.target.value }))} className="mt-1 w-full h-12 rounded-xl border cursor-pointer" />
                </div>
                <div>
                  <label className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>Default status</label>
                  <select value={listForm.status} onChange={(e) => setListForm((prev) => ({ ...prev, status: e.target.value }))} className={`mt-1 w-full px-3 py-3 rounded-xl border text-sm ${isDark ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-slate-200'}`}>
                    {STATUS_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className={`px-6 py-4 border-t flex justify-end gap-3 ${isDark ? 'border-gray-700' : 'border-slate-100'}`}>
              <button type="button" onClick={() => setShowListModal(false)} className={`px-4 py-2 rounded-xl text-sm ${isDark ? 'bg-gray-800 text-gray-200' : 'bg-slate-100 text-slate-700'}`}>Cancel</button>
              <button type="button" disabled={saving} onClick={saveList} className="px-5 py-2 rounded-xl text-sm font-semibold bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50">
                {saving ? 'Saving...' : 'Save list'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

window.TaskManagement = TaskManagement;
window.dispatchEvent(new CustomEvent('taskManagementComponentReady'));
