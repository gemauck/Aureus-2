export type TeamCounts = {
  documents?: number
  workflows?: number
  discussions?: number
  checklists?: number
  notices?: number
  tasks?: number
}

export type TeamMembership = {
  userId: string
  role?: string
  user?: { id: string; name?: string; email?: string; avatar?: string }
}

export type Team = {
  id: string
  name: string
  icon?: string
  color?: string
  description?: string
  members?: number
  isActive?: boolean
  counts?: TeamCounts
  memberships?: TeamMembership[]
}

export type DiscussionAttachment = {
  name?: string
  url?: string
  mimeType?: string
  size?: number
}

export type DiscussionReply = {
  id: string
  discussionId: string
  body: string
  attachments?: DiscussionAttachment[]
  authorId?: string
  authorName?: string
  createdAt?: string
  updatedAt?: string
}

export type DiscussionChecklist = {
  id: string
  discussionId: string
  title?: string
  items?: unknown
  sortOrder?: number
}

export type TeamDiscussion = {
  id: string
  teamId: string
  title: string
  body?: string
  authorId?: string
  authorName?: string
  type?: 'discussion' | 'notice' | string
  pinned?: boolean
  createdAt?: string
  updatedAt?: string
  team?: Pick<Team, 'id' | 'name' | 'color' | 'icon'>
  replies?: DiscussionReply[]
  checklists?: DiscussionChecklist[]
  _count?: { replies?: number; checklists?: number; tasks?: number }
}

export type TeamDocument = {
  id: string
  teamId: string
  title: string
  category?: string
  content?: string
  status?: string
  tags?: string[]
  attachments?: DiscussionAttachment[]
  createdAt?: string
  updatedAt?: string
}

export type TeamWorkflow = {
  id: string
  teamId: string
  title: string
  description?: string
  canvasKind?: 'excalidraw' | 'drawio' | string
  canvasData?: unknown
  steps?: unknown
  tags?: string[]
  createdAt?: string
  updatedAt?: string
}

export type SarsChange = {
  id: string
  url?: string
  title?: string
  summary?: string
  category?: string
  priority?: string
  isNew?: boolean
  isRead?: boolean
  detectedAt?: string
  createdAt?: string
}

export type SarsStats = {
  total?: number
  new?: number
  unread?: number
}

export type MeetingDepartment = {
  id: string
  name: string
}

export type DepartmentNotes = {
  id: string
  weeklyNotesId: string
  departmentId: string
  successes?: string
  weekToFollow?: string
  frustrations?: string
  agendaPoints?: string
  attachments?: string
  assignedUserId?: string
}

export type WeeklyMeetingNotes = {
  id: string
  monthlyNotesId: string
  weekKey: string
  weekStart?: string
  weekEnd?: string
  generalMinutes?: string
  generalMinutesThreads?: unknown
  generalMinutesAttachments?: string
  departmentNotes?: DepartmentNotes[]
  actionItems?: MeetingActionItem[]
}

export type MeetingActionItem = {
  id: string
  title: string
  description?: string
  status?: string
  priority?: string
  assignedUserId?: string
  dueDate?: string
  departmentNotesId?: string
  weeklyNotesId?: string
  monthlyNotesId?: string
}

export type MonthlyMeetingNotes = {
  id: string
  monthKey: string
  monthlyGoals?: string
  status?: string
  weeklyNotes?: WeeklyMeetingNotes[]
  actionItems?: MeetingActionItem[]
}

export type TeamTabId =
  | 'discussions'
  | 'process-flows'
  | 'meeting-notes'
  | 'poa-review'
  | 'dfrr-check'
  | 'sars-monitoring'
  | 'members'
