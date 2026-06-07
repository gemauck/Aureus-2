export type UserTaskChecklistItem = {
  id: string
  text: string
  completed: boolean
}

export type UserTaskTag = {
  id: string
  name: string
  color?: string
}

export type UserTaskList = {
  id: string
  name: string
  color?: string
  order?: number
  status?: string
}

export type UserTask = {
  id: string
  title: string
  description?: string
  status?: string
  priority?: string
  category?: string
  dueDate?: string | null
  completedDate?: string | null
  listId?: string | null
  clientId?: string | null
  projectId?: string | null
  checklist?: UserTaskChecklistItem[]
  tags?: UserTaskTag[]
  createdAt?: string
  updatedAt?: string
}

export type UserTaskStatusFilter = 'all' | 'todo' | 'in-progress' | 'completed' | 'cancelled'
