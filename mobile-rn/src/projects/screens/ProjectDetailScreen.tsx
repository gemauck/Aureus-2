import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { OfflineBanner } from '../../components/OfflineBanner'
import { useNetwork } from '../../hooks/useNetwork'
import {
  cacheEntityDetail,
  projectDetailCacheKey,
  readEntityDetail
} from '../../offline/entityDetailCache'
import { offlineListMessage } from '../../offline/erpReadCaches'
import { useAuth } from '../../state/AuthContext'

import { projectsApi } from '../api'
import { DocumentCollectionSummary } from '../components/DocumentCollectionSummary'
import { ProjectStatusBadge } from '../components/ProjectStatusBadge'
import { TaskKanbanView, TaskListGroupedView } from '../components/TaskKanbanView'
import { TaskRow } from '../components/TaskRow'
import type { ProjectsStackParamList } from '../navigation'
import type {
  ProjectActivityEntry,
  ProjectDetail,
  ProjectDetailTab,
  ProjectDocument,
  ProjectNote,
  ProjectTask,
  TaskFilterStatus,
  TaskViewMode
} from '../types'
import {
  activityIcon,
  enabledProcesses,
  formatDate,
  formatDateRange,
  formatDateTime,
  formatRelative,
  parseDriveLinks,
  PROJECT_STATUS_EDIT,
  projectTasks,
  stripHtml,
  summarizeDocumentCollection,
  TASK_STATUSES,
  webProjectUrl
} from '../utils'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'

type Props = NativeStackScreenProps<ProjectsStackParamList, 'ProjectDetail'>

const DETAIL_TABS: { key: ProjectDetailTab; label: string; icon: string }[] = [
  { key: 'overview', label: 'Overview', icon: 'info-circle' },
  { key: 'tasks', label: 'Tasks', icon: 'tasks' },
  { key: 'notes', label: 'Notes', icon: 'sticky-note' },
  { key: 'activity', label: 'Activity', icon: 'history' },
  { key: 'documents', label: 'Docs', icon: 'file-alt' },
  { key: 'team', label: 'Team', icon: 'users' },
  { key: 'processes', label: 'Modules', icon: 'puzzle-piece' }
]

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  const styles = useThemedStyles(createStyles)
  if (!value) return null
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  )
}

export function ProjectDetailScreen({ route, navigation }: Props) {
  const styles = useThemedStyles(createStyles)
  const { erp } = useTheme()
  const { projectId, initialTab } = route.params
  const { accessToken } = useAuth()
  const { isOnline } = useNetwork()
  const [readOnlyOffline, setReadOnlyOffline] = useState(false)
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [notes, setNotes] = useState<ProjectNote[]>([])
  const [activity, setActivity] = useState<ProjectActivityEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<ProjectDetailTab>(
    (initialTab as ProjectDetailTab) || 'overview'
  )
  const [taskQuery, setTaskQuery] = useState('')
  const [taskStatus, setTaskStatus] = useState<TaskFilterStatus>('all')
  const [showNewTask, setShowNewTask] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [creatingTask, setCreatingTask] = useState(false)
  const [showNewNote, setShowNewNote] = useState(false)
  const [newNoteTitle, setNewNoteTitle] = useState('')
  const [newNoteContent, setNewNoteContent] = useState('')
  const [creatingNote, setCreatingNote] = useState(false)
  const [taskViewMode, setTaskViewMode] = useState<TaskViewMode>('list')
  const [activityFilter, setActivityFilter] = useState('all')
  const [showStatusPicker, setShowStatusPicker] = useState(false)
  const tabScrollRef = useRef<ScrollView>(null)
  const tabIndex = DETAIL_TABS.findIndex((t) => t.key === tab)

  useEffect(() => {
    if (tabIndex < 0 || !tabScrollRef.current) return
    tabScrollRef.current.scrollTo({ x: Math.max(0, tabIndex * 108 - 24), animated: true })
  }, [tabIndex])

  const loadDetails = useCallback(
    async (silent = false) => {
      if (!accessToken) return
      if (!silent) setDetailsLoading(true)
      try {
        const full = await projectsApi.getProjectFull(accessToken, projectId)
        setProject((prev) =>
          prev
            ? {
                ...prev,
                ...full,
                tasks: full.tasks?.length ? full.tasks : prev.tasks,
                tasksList: full.tasksList?.length ? full.tasksList : prev.tasksList
              }
            : full
        )
      } catch {
        // Non-fatal: overview/tasks still work from summary payload
      } finally {
        setDetailsLoading(false)
      }
    },
    [accessToken, projectId]
  )

  const load = useCallback(
    async (silent = false) => {
      if (!accessToken) return
      if (!silent) setLoading(true)
      setError('')
      setReadOnlyOffline(false)

      type ProjectDetailCache = {
        project: ProjectDetail
        notes: ProjectNote[]
        activity: ProjectActivityEntry[]
      }

      const applyCached = async () => {
        const cached = await readEntityDetail<ProjectDetailCache>(projectDetailCacheKey(projectId))
        if (cached?.project) {
          setProject(cached.project)
          setNotes(cached.notes || [])
          setActivity(cached.activity || [])
          setReadOnlyOffline(true)
          return true
        }
        setError(offlineListMessage(false))
        return false
      }

      if (!isOnline) {
        await applyCached()
        setLoading(false)
        setRefreshing(false)
        return
      }

      try {
        const [proj, noteList, act] = await Promise.all([
          projectsApi.getProjectSummary(accessToken, projectId),
          projectsApi.listNotes(accessToken, projectId).catch(() => []),
          projectsApi.listActivity(accessToken, projectId).catch(() => [])
        ])
        setProject(proj)
        setNotes(noteList)
        setActivity(act)
        await cacheEntityDetail(projectDetailCacheKey(projectId), {
          project: proj,
          notes: noteList,
          activity: act
        })
        void loadDetails(true)
      } catch (e) {
        const hadCache = await applyCached()
        if (!hadCache) {
          setError(e instanceof Error ? e.message : 'Could not load project')
        }
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [accessToken, isOnline, projectId, loadDetails]
  )

  useEffect(() => {
    void load()
  }, [load])

  const tasks = useMemo(() => (project ? projectTasks(project) : []), [project])
  const filteredTasks = useMemo(() => {
    const q = taskQuery.trim().toLowerCase()
    return tasks.filter((t) => {
      if (taskStatus !== 'all' && String(t.status || '') !== taskStatus) return false
      if (!q) return true
      return `${t.title || ''} ${t.status || ''} ${t.assignee || ''}`.toLowerCase().includes(q)
    })
  }, [tasks, taskQuery, taskStatus])

  const processes = useMemo(() => (project ? enabledProcesses(project) : []), [project])
  const driveLinks = useMemo(() => (project ? parseDriveLinks(project) : []), [project])
  const docSummary = useMemo(
    () => (project ? summarizeDocumentCollection(project.documentSections) : null),
    [project]
  )
  const filteredActivity = useMemo(() => {
    const entries = activity.length ? activity : project?.activityLog || []
    if (activityFilter === 'all') return entries
    return entries.filter((e) => {
      const cat = String(e.type || '').toLowerCase()
      if (activityFilter === 'tasks') return cat.includes('task')
      if (activityFilter === 'trackers') return cat.includes('document') || cat.includes('fms')
      if (activityFilter === 'notes') return cat.includes('note')
      return true
    })
  }, [activity, project?.activityLog, activityFilter])

  const openTask = (task: ProjectTask) =>
    navigation.navigate('TaskDetail', {
      taskId: task.id,
      projectId,
      projectName: project?.name
    })

  const updateProjectStatus = async (status: string) => {
    if (!accessToken || !project || readOnlyOffline) return
    try {
      const updated = await projectsApi.patchProject(accessToken, projectId, { status })
      setProject((prev) => (prev ? { ...prev, ...updated } : updated))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update status')
    }
  }

  const createTask = async () => {
    if (!accessToken || !newTaskTitle.trim() || readOnlyOffline) return
    setCreatingTask(true)
    try {
      await projectsApi.createTask(accessToken, {
        projectId,
        title: newTaskTitle.trim(),
        status: 'To Do',
        priority: 'Medium'
      })
      setNewTaskTitle('')
      setShowNewTask(false)
      await load(true)
      setTab('tasks')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create task')
    } finally {
      setCreatingTask(false)
    }
  }

  const createNote = async () => {
    if (!accessToken || readOnlyOffline) return
    setCreatingNote(true)
    try {
      const note = await projectsApi.createNote(accessToken, projectId, {
        title: newNoteTitle.trim() || 'Untitled Note',
        content: newNoteContent
      })
      setNotes((prev) => [note, ...prev])
      setNewNoteTitle('')
      setNewNoteContent('')
      setShowNewNote(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create note')
    } finally {
      setCreatingNote(false)
    }
  }

  if (loading && !project) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={erp.primary} />
      </View>
    )
  }

  if (error && !project) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.backLink}>Go back</Text>
        </Pressable>
      </View>
    )
  }

  if (!project) return null

  const documents: ProjectDocument[] = project.documents || []
  const team = project.team || []

  return (
    <View style={styles.root}>
      <OfflineBanner visible={readOnlyOffline} variant="read" />
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <FontAwesome5 name="arrow-left" size={16} color={erp.primary} />
          <Text style={styles.backText}>Projects</Text>
        </Pressable>
        <View style={styles.headerBody}>
          <Text style={styles.title} numberOfLines={2}>
            {project.name || 'Unnamed'}
          </Text>
          <View style={styles.headerMeta}>
            {project.status ? <ProjectStatusBadge label={project.status} /> : null}
            {project.clientName ? <Text style={styles.client}>{project.clientName}</Text> : null}
          </View>
        </View>
        <Pressable
          style={styles.webBtn}
          onPress={() => void Linking.openURL(webProjectUrl(projectId))}
        >
          <FontAwesome5 name="external-link-alt" size={12} color={erp.primary} />
          <Text style={styles.webBtnText}>Web</Text>
        </Pressable>
      </View>

      <View style={styles.tabBarWrap}>
        <ScrollView
          ref={tabScrollRef}
          horizontal
          showsHorizontalScrollIndicator
          style={styles.tabBar}
          contentContainerStyle={styles.tabBarContent}
          keyboardShouldPersistTaps="handled"
        >
          {DETAIL_TABS.map((t) => {
            const active = tab === t.key
            const badge =
              t.key === 'tasks'
                ? tasks.length
                : t.key === 'notes'
                  ? notes.length
                  : t.key === 'processes'
                    ? processes.length
                    : 0
            return (
              <Pressable
                key={t.key}
                style={[styles.detailTab, active && styles.detailTabActive]}
                onPress={() => setTab(t.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <FontAwesome5 name={t.icon} size={11} color={active ? erp.primary : erp.textMuted} />
                <Text
                  style={[styles.detailTabText, active && styles.detailTabTextActive]}
                  numberOfLines={1}
                >
                  {t.label}
                </Text>
                {badge > 0 ? (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>{badge > 99 ? '99+' : badge}</Text>
                  </View>
                ) : null}
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.bodyScroll}
        contentContainerStyle={styles.body}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              void load(true)
            }}
            tintColor={erp.primary}
          />
        }
      >
        {error ? <Text style={styles.inlineError}>{error}</Text> : null}

        {tab === 'overview' ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Project status</Text>
            <Pressable
              style={styles.statusSelect}
              onPress={() => setShowStatusPicker(true)}
              accessibilityRole="button"
              accessibilityLabel="Change project status"
            >
              <ProjectStatusBadge label={project.status || 'Active'} />
              <FontAwesome5 name="chevron-down" size={12} color={erp.textMuted} />
            </Pressable>

            {docSummary && project.hasDocumentCollectionProcess ? (
              <DocumentCollectionSummary summary={docSummary} projectId={projectId} />
            ) : null}

            {driveLinks.length > 0 ? (
              <View style={styles.subSection}>
                <Text style={styles.subTitle}>Drive links</Text>
                {driveLinks.map((link, idx) => (
                  <Pressable
                    key={`${link.url}-${idx}`}
                    style={styles.driveRow}
                    onPress={() => void Linking.openURL(link.url)}
                  >
                    <FontAwesome5 name="cloud" size={14} color={erp.primary} />
                    <Text style={styles.driveLabel}>{link.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <InfoRow label="Type" value={project.type} />
            <InfoRow label="Priority" value={project.priority} />
            <InfoRow label="Assigned to" value={project.assignedTo} />
            <InfoRow label="Dates" value={formatDateRange(project.startDate, project.dueDate)} />
            <InfoRow label="Tasks" value={String(tasks.length)} />
            {project.description ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Description</Text>
                <Text style={styles.infoValue}>{project.description}</Text>
              </View>
            ) : null}
            {project.googleDriveLink ? (
              <Pressable onPress={() => void Linking.openURL(project.googleDriveLink!)}>
                <InfoRow label="Google Drive" value="Open folder" />
              </Pressable>
            ) : null}
            {processes.length > 0 ? (
              <View style={styles.subSection}>
                <Text style={styles.subTitle}>Enabled modules</Text>
                {processes.map((p) => (
                  <Pressable
                    key={p.id}
                    style={styles.processChip}
                    onPress={() => void Linking.openURL(webProjectUrl(projectId, p.tab))}
                  >
                    <FontAwesome5 name={p.icon} size={14} color={erp.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.processChipText}>{p.label}</Text>
                      <Text style={styles.processPurpose}>{p.purpose}</Text>
                    </View>
                    <FontAwesome5 name="external-link-alt" size={10} color={erp.textSubtle} />
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {tab === 'tasks' ? (
          <View style={styles.section}>
            <View style={styles.taskViewToggle}>
              {(['list', 'kanban', 'lists'] as TaskViewMode[]).map((mode) => (
                <Pressable
                  key={mode}
                  style={[styles.viewModeBtn, taskViewMode === mode && styles.viewModeBtnActive]}
                  onPress={() => setTaskViewMode(mode)}
                >
                  <Text
                    style={[
                      styles.viewModeText,
                      taskViewMode === mode && styles.viewModeTextActive
                    ]}
                  >
                    {mode === 'list' ? 'List' : mode === 'kanban' ? 'Board' : 'By list'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.taskToolbar}>
              <TextInput
                style={styles.taskSearch}
                placeholder="Search tasks…"
                placeholderTextColor={erp.textSubtle}
                value={taskQuery}
                onChangeText={setTaskQuery}
              />
              <Pressable style={styles.addBtn} onPress={() => setShowNewTask(true)}>
                <FontAwesome5 name="plus" size={14} color="#fff" />
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.taskChips}
              contentContainerStyle={styles.chipRow}
            >
              {(['all', ...TASK_STATUSES] as TaskFilterStatus[]).map((st) => {
                const active = taskStatus === st
                return (
                  <Pressable
                    key={st}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setTaskStatus(st)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {st === 'all' ? 'All' : st}
                    </Text>
                  </Pressable>
                )
              })}
            </ScrollView>
            {filteredTasks.length === 0 ? (
              <Text style={styles.empty}>No tasks match.</Text>
            ) : taskViewMode === 'kanban' ? (
              <TaskKanbanView tasks={filteredTasks} onTaskPress={openTask} />
            ) : taskViewMode === 'lists' ? (
              <TaskListGroupedView
                tasks={filteredTasks}
                taskLists={project.taskLists || []}
                onTaskPress={openTask}
              />
            ) : (
              filteredTasks.map((task) => (
                <TaskRow key={task.id} task={task} onPress={() => openTask(task)} />
              ))
            )}
          </View>
        ) : null}

        {tab === 'notes' ? (
          <View style={styles.section}>
            <Pressable style={styles.primaryBtn} onPress={() => setShowNewNote(true)}>
              <FontAwesome5 name="plus" size={12} color="#fff" />
              <Text style={styles.primaryBtnText}>New note</Text>
            </Pressable>
            {notes.length === 0 ? (
              <Text style={styles.empty}>No project notes yet.</Text>
            ) : (
              notes.map((note) => (
                <Pressable
                  key={note.id}
                  style={styles.noteCard}
                  onPress={() =>
                    navigation.navigate('NoteDetail', {
                      projectId,
                      noteId: note.id,
                      projectName: project.name
                    })
                  }
                >
                  <Text style={styles.noteTitle}>{note.title || 'Untitled'}</Text>
                  {note.content ? (
                    <Text style={styles.noteContent} numberOfLines={4}>
                      {stripHtml(note.content)}
                    </Text>
                  ) : null}
                  <Text style={styles.noteMeta}>
                    {[note.author?.name, formatRelative(note.updatedAt || note.createdAt)]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </Pressable>
              ))
            )}
          </View>
        ) : null}

        {tab === 'activity' ? (
          <View style={styles.section}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.taskChips}
              contentContainerStyle={styles.chipRow}
            >
              {['all', 'tasks', 'trackers', 'notes'].map((f) => {
                const active = activityFilter === f
                return (
                  <Pressable
                    key={f}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setActivityFilter(f)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                    </Text>
                  </Pressable>
                )
              })}
            </ScrollView>
            {filteredActivity.length === 0 ? (
              <Text style={styles.empty}>No activity recorded.</Text>
            ) : (
              filteredActivity.map((entry) => (
                <View key={entry.id} style={styles.activityCard}>
                  <View style={styles.activityTop}>
                    <FontAwesome5
                      name={activityIcon(entry.type)}
                      size={14}
                      color={erp.primary}
                    />
                    <Text style={styles.activityDesc}>{entry.description || entry.type || 'Activity'}</Text>
                  </View>
                  <Text style={styles.activityMeta}>
                    {[entry.userName || entry.user?.name, formatRelative(entry.createdAt)]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
              ))
            )}
          </View>
        ) : null}

        {tab === 'documents' ? (
          <View style={styles.section}>
            {detailsLoading && documents.length === 0 ? (
              <ActivityIndicator size="small" color={erp.primary} style={{ marginVertical: 16 }} />
            ) : documents.length === 0 ? (
              <Text style={styles.empty}>No documents uploaded.</Text>
            ) : (
              documents.map((doc) => (
                <Pressable
                  key={doc.id}
                  style={styles.docCard}
                  onPress={() => doc.url && void Linking.openURL(doc.url)}
                  disabled={!doc.url}
                >
                  <FontAwesome5 name="file-alt" size={18} color={erp.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.docTitle}>{doc.name || 'Document'}</Text>
                    {doc.description ? (
                      <Text style={styles.docSub} numberOfLines={2}>
                        {doc.description}
                      </Text>
                    ) : null}
                    <Text style={styles.docMeta}>
                      {[doc.uploader?.name, formatDate(doc.uploadDate)].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  {doc.url ? (
                    <FontAwesome5 name="external-link-alt" size={12} color={erp.textSubtle} />
                  ) : null}
                </Pressable>
              ))
            )}
          </View>
        ) : null}

        {tab === 'team' ? (
          <View style={styles.section}>
            {detailsLoading && team.length === 0 ? (
              <ActivityIndicator size="small" color={erp.primary} style={{ marginVertical: 16 }} />
            ) : team.length === 0 ? (
              <Text style={styles.empty}>No team members assigned.</Text>
            ) : (
              team.map((member) => (
                <View key={member.id} style={styles.teamCard}>
                  <View style={styles.teamAvatar}>
                    <Text style={styles.teamAvatarText}>
                      {(member.user?.name || '?').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.teamName}>{member.user?.name || 'Member'}</Text>
                    {member.user?.email ? (
                      <Text style={styles.teamEmail}>{member.user.email}</Text>
                    ) : null}
                    {member.role ? <Text style={styles.teamRole}>{member.role}</Text> : null}
                  </View>
                </View>
              ))
            )}
          </View>
        ) : null}

        {tab === 'processes' ? (
          <View style={styles.section}>
            {processes.length === 0 ? (
              <Text style={styles.empty}>
                No process modules enabled on this project. Enable them in the web ERP settings.
              </Text>
            ) : (
              processes.map((p) => (
                <Pressable
                  key={p.id}
                  style={styles.processCard}
                  onPress={() => void Linking.openURL(webProjectUrl(projectId, p.tab))}
                >
                  <View style={styles.processIcon}>
                    <FontAwesome5 name={p.icon} size={20} color={erp.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.processTitle}>{p.label}</Text>
                    <Text style={styles.processDesc}>{p.description}</Text>
                    <Text style={styles.processPurpose}>{p.purpose}</Text>
                    <Text style={styles.processHint}>Open full tracker on web →</Text>
                  </View>
                </Pressable>
              ))
            )}
          </View>
        ) : null}
      </ScrollView>

      <Modal
        visible={showStatusPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStatusPicker(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowStatusPicker(false)}>
          <Pressable style={styles.statusPickerSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Project status</Text>
            {PROJECT_STATUS_EDIT.map((st) => {
              const active = project.status === st
              return (
                <Pressable
                  key={st}
                  style={[styles.statusPickerRow, active && styles.statusPickerRowActive]}
                  onPress={() => {
                    setShowStatusPicker(false)
                    void updateProjectStatus(st)
                  }}
                >
                  <ProjectStatusBadge label={st} compact />
                  {active ? <FontAwesome5 name="check" size={14} color={erp.primary} /> : null}
                </Pressable>
              )
            })}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showNewTask} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New task</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Task title"
              placeholderTextColor={erp.textSubtle}
              value={newTaskTitle}
              onChangeText={setNewTaskTitle}
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setShowNewTask(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSave, creatingTask && styles.disabled]}
                disabled={creatingTask || !newTaskTitle.trim()}
                onPress={() => void createTask()}
              >
                {creatingTask ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalSaveText}>Create</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showNewNote} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New note</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Title"
              placeholderTextColor={erp.textSubtle}
              value={newNoteTitle}
              onChangeText={setNewNoteTitle}
            />
            <TextInput
              style={[styles.modalInput, styles.modalTextArea]}
              placeholder="Content"
              placeholderTextColor={erp.textSubtle}
              value={newNoteContent}
              onChangeText={setNewNoteContent}
              multiline
              textAlignVertical="top"
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setShowNewNote(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSave, creatingNote && styles.disabled]}
                disabled={creatingNote}
                onPress={() => void createNote()}
              >
                {creatingNote ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalSaveText}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: erp.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: erp.danger, fontWeight: '700', textAlign: 'center' },
  inlineError: { color: erp.danger, fontWeight: '600', marginBottom: 8 },
  backLink: { color: erp.primary, fontWeight: '700', marginTop: 8 },
  header: {
    flexShrink: 0,
    paddingTop: 10,
    paddingHorizontal: erp.space.lg,
    paddingBottom: 10,
    backgroundColor: erp.surface,
    borderBottomWidth: 1,
    borderBottomColor: erp.border
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  backText: { color: erp.primary, fontWeight: '700', fontSize: 15 },
  headerBody: { gap: 6, paddingRight: 72 },
  title: { fontSize: 20, fontWeight: '800', color: erp.text, lineHeight: 26 },
  headerMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  client: { fontSize: 13, color: erp.textMuted, fontWeight: '600' },
  webBtn: {
    position: 'absolute',
    top: 12,
    right: erp.space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: erp.radius.md,
    borderWidth: 1,
    borderColor: erp.border,
    backgroundColor: erp.surface
  },
  webBtnText: { fontSize: 12, fontWeight: '700', color: erp.primary },
  tabBarWrap: {
    flexShrink: 0,
    backgroundColor: erp.surface,
    borderBottomWidth: 1,
    borderBottomColor: erp.border
  },
  tabBar: { flexGrow: 0 },
  tabBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: erp.space.lg,
    paddingVertical: 2
  },
  bodyScroll: { flex: 1 },
  detailTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  detailTabActive: { borderBottomWidth: 2, borderBottomColor: erp.primary },
  detailTabText: { fontSize: 12, fontWeight: '700', color: erp.textMuted },
  detailTabTextActive: { color: erp.primary },
  tabBadge: {
    backgroundColor: erp.primarySoft,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center'
  },
  tabBadgeText: { fontSize: 10, fontWeight: '800', color: erp.primary },
  body: { padding: erp.space.lg, paddingBottom: 40 },
  section: { gap: 12 },
  statusSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: erp.surface,
    borderRadius: erp.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: erp.border
  },
  statusPickerSheet: {
    backgroundColor: erp.surface,
    borderTopLeftRadius: erp.radius.xl,
    borderTopRightRadius: erp.radius.xl,
    padding: erp.space.lg,
    paddingBottom: 32
  },
  statusPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: erp.border
  },
  statusPickerRowActive: { backgroundColor: erp.primarySoft },
  infoRow: {
    backgroundColor: erp.surface,
    borderRadius: erp.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: erp.border
  },
  infoLabel: { fontSize: 11, fontWeight: '700', color: erp.textSubtle, textTransform: 'uppercase', marginBottom: 4 },
  infoValue: { fontSize: 15, color: erp.text, lineHeight: 21 },
  subSection: { marginTop: 4, gap: 8 },
  subTitle: { fontSize: 14, fontWeight: '800', color: erp.text },
  processChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: erp.surface,
    padding: 12,
    borderRadius: erp.radius.md,
    borderWidth: 1,
    borderColor: erp.border
  },
  processChipText: { fontWeight: '700', color: erp.text },
  processPurpose: { fontSize: 11, color: erp.textSubtle, marginTop: 2, lineHeight: 15 },
  sectionLabel: { fontSize: 12, fontWeight: '800', color: erp.textMuted, textTransform: 'uppercase' },
  driveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    backgroundColor: erp.surface,
    borderRadius: erp.radius.md,
    borderWidth: 1,
    borderColor: erp.border
  },
  driveLabel: { fontSize: 14, fontWeight: '700', color: erp.primary },
  taskViewToggle: {
    flexDirection: 'row',
    backgroundColor: erp.surfaceMuted,
    borderRadius: erp.radius.md,
    padding: 4,
    marginBottom: 8
  },
  viewModeBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  viewModeBtnActive: { backgroundColor: erp.surface, ...erp.shadowSm },
  viewModeText: { fontSize: 12, fontWeight: '700', color: erp.textMuted },
  viewModeTextActive: { color: erp.primary },
  activityTop: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  taskToolbar: { flexDirection: 'row', gap: 8 },
  taskSearch: {
    flex: 1,
    borderWidth: 1,
    borderColor: erp.border,
    borderRadius: erp.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: erp.surface,
    color: erp.text
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: erp.radius.md,
    backgroundColor: erp.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  taskChips: { flexGrow: 0, marginBottom: 4, minHeight: 40 },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: erp.space.sm
  },
  chip: {
    flexShrink: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: erp.surface,
    borderWidth: 1,
    borderColor: erp.border
  },
  chipActive: { backgroundColor: erp.primarySoft, borderColor: erp.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: erp.textMuted },
  chipTextActive: { color: erp.primary },
  empty: { color: erp.textMuted, textAlign: 'center', padding: 24 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: erp.primary,
    borderRadius: erp.radius.md,
    paddingVertical: 12
  },
  primaryBtnText: { color: '#fff', fontWeight: '800' },
  noteCard: {
    backgroundColor: erp.surface,
    borderRadius: erp.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: erp.border
  },
  noteTitle: { fontSize: 15, fontWeight: '800', color: erp.text },
  noteContent: { fontSize: 14, color: erp.textMuted, marginTop: 6, lineHeight: 20 },
  noteMeta: { fontSize: 11, color: erp.textSubtle, marginTop: 8 },
  activityCard: {
    backgroundColor: erp.surfaceMuted,
    borderRadius: erp.radius.md,
    padding: 12
  },
  activityDesc: { fontSize: 14, color: erp.text, lineHeight: 20 },
  activityMeta: { fontSize: 11, color: erp.textSubtle, marginTop: 6 },
  docCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: erp.surface,
    borderRadius: erp.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: erp.border
  },
  docTitle: { fontSize: 15, fontWeight: '800', color: erp.text },
  docSub: { fontSize: 13, color: erp.textMuted, marginTop: 4 },
  docMeta: { fontSize: 11, color: erp.textSubtle, marginTop: 6 },
  teamCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: erp.surface,
    borderRadius: erp.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: erp.border
  },
  teamAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: erp.primarySoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  teamAvatarText: { fontSize: 16, fontWeight: '800', color: erp.primary },
  teamName: { fontSize: 15, fontWeight: '800', color: erp.text },
  teamEmail: { fontSize: 13, color: erp.textMuted, marginTop: 2 },
  teamRole: { fontSize: 12, color: erp.primary, fontWeight: '700', marginTop: 4 },
  processCard: {
    flexDirection: 'row',
    gap: 14,
    backgroundColor: erp.surface,
    borderRadius: erp.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: erp.border,
    ...erp.shadowSm
  },
  processIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: erp.primarySoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  processTitle: { fontSize: 16, fontWeight: '800', color: erp.text },
  processDesc: { fontSize: 13, color: erp.textMuted, marginTop: 4 },
  processHint: { fontSize: 12, color: erp.primary, fontWeight: '700', marginTop: 8 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end'
  },
  modalCard: {
    backgroundColor: erp.surface,
    borderTopLeftRadius: erp.radius.xl,
    borderTopRightRadius: erp.radius.xl,
    padding: erp.space.lg,
    paddingBottom: 32
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: erp.text, marginBottom: 12 },
  modalInput: {
    borderWidth: 1,
    borderColor: erp.border,
    borderRadius: erp.radius.md,
    padding: 12,
    backgroundColor: erp.bg,
    color: erp.text,
    marginBottom: 10
  },
  modalTextArea: { minHeight: 100 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalCancel: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: erp.radius.md,
    borderWidth: 1,
    borderColor: erp.border
  },
  modalCancelText: { fontWeight: '700', color: erp.textMuted },
  modalSave: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: erp.radius.md,
    backgroundColor: erp.primary
  },
  modalSaveText: { fontWeight: '800', color: '#fff' },
  disabled: { opacity: 0.6 }
  })
}