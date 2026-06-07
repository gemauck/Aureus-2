export type ProjectSummary = {
  id: string
  name?: string
  clientId?: string
  clientName?: string
  status?: string
  type?: string
  startDate?: string
  dueDate?: string
  assignedTo?: string
  description?: string
  progress?: number
  priority?: string
  budget?: number
  actualCost?: number
  tasksCount?: number
  googleDriveLink?: string
  onlineDriveLinks?: string
  notes?: string
  hasTimeProcess?: boolean
  hasDocumentCollectionProcess?: boolean
  hasWeeklyFMSReviewProcess?: boolean
  hasMonthlyFMSReviewProcess?: boolean
  hasMonthlyDataReviewProcess?: boolean
  hasComplianceReviewProcess?: boolean
  includeInProgressTracker?: boolean
  monthlyProgress?: unknown
  documentSections?: DocumentSectionsJson
  createdAt?: string
  updatedAt?: string
}

export type DocumentSectionsJson = Record<
  string,
  Array<{
    id?: string
    name?: string
    documents?: Array<{
      id?: string
      name?: string
      collectionStatus?: Record<string, string>
    }>
  }>
>

export type ProjectTaskList = {
  id: string
  listId?: number
  name?: string
  color?: string
  order?: number
}

export type TaskComment = {
  id?: string
  text?: string
  author?: string
  authorId?: string
  userName?: string
  createdAt?: string
  timestamp?: string
}

export type ChecklistItem = {
  id?: string
  text?: string
  done?: boolean
}

export type ProjectTask = {
  id: string
  title?: string
  description?: string
  status?: string
  priority?: string
  assignee?: string
  assigneeId?: string
  listId?: number
  dueDate?: string
  startDate?: string
  projectId?: string
  projectName?: string
  order?: number
  checklist?: ChecklistItem[]
  subtasks?: ProjectTask[]
  comments?: TaskComment[]
  tags?: string[]
  createdAt?: string
  updatedAt?: string
  project?: { id: string; name?: string; clientName?: string }
}

export type ProjectNote = {
  id: string
  title?: string
  content?: string
  tags?: string[]
  author?: { id?: string; name?: string; email?: string } | null
  createdAt?: string
  updatedAt?: string
}

export type ProjectDocument = {
  id: string
  name?: string
  description?: string
  url?: string
  type?: string
  mimeType?: string
  size?: number
  uploadDate?: string
  uploader?: { id?: string; name?: string; email?: string }
}

export type ProjectTeamMember = {
  id: string
  role?: string
  notes?: string
  user?: { id?: string; name?: string; email?: string }
}

export type ProjectActivityEntry = {
  id: string
  type?: string
  description?: string
  userName?: string
  user?: { id?: string; name?: string; email?: string }
  createdAt?: string
  metadata?: string | Record<string, unknown>
}

export type ProjectDetail = ProjectSummary & {
  tasks?: ProjectTask[]
  tasksList?: ProjectTask[]
  taskLists?: ProjectTaskList[]
  documents?: ProjectDocument[]
  team?: ProjectTeamMember[]
  activityLog?: ProjectActivityEntry[]
  customFieldDefinitions?: Array<{ id: string; name?: string; type?: string }>
  projectContacts?: string
}

export type ErpUser = {
  id: string
  name?: string
  email?: string
}

export type DriveLink = {
  label: string
  url: string
}

export type DocCollectionSummary = {
  year: string
  monthKey: string
  monthLabel: string
  totalCells: number
  collected: number
  pending: number
  other: number
}

export type ProjectInsights = {
  totalProjects: number
  activeProjects: number
  starredCount: number
  totalTasks: number
  myOpenTasks: number
  overdueTasks: number
  dueSoonTasks: number
}

export type ProjectsTab = 'projects' | 'tasks'

export type ProjectListView = 'list' | 'client'

export type ProjectFilterKey = 'all' | 'active' | 'starred'

export type ProjectSortKey = 'name' | 'client' | 'updated' | 'due'

export type TaskScopeFilter = 'all' | 'mine' | 'overdue' | 'dueSoon'

export type TaskViewMode = 'list' | 'kanban' | 'lists'

export type ProjectStatusFilter = 'all' | 'Active' | 'In Progress' | 'Completed' | 'On Hold' | 'Cancelled'

export type ProjectDetailTab =
  | 'overview'
  | 'tasks'
  | 'notes'
  | 'activity'
  | 'documents'
  | 'team'
  | 'processes'

export type TaskFilterStatus = 'all' | 'To Do' | 'In Progress' | 'Done' | 'Blocked' | 'Archived'

export type ClientProjectGroup = {
  clientKey: string
  clientName: string
  projects: ProjectSummary[]
}
