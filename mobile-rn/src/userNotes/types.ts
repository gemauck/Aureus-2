export type UserNote = {
  id: string
  title: string
  content?: string
  tags?: string[]
  pinned?: boolean
  isPublic?: boolean
  isOwner?: boolean
  ownerId?: string
  clientId?: string | null
  projectId?: string | null
  client?: { id: string; name?: string | null } | null
  project?: { id: string; name?: string | null } | null
  author?: { id: string; name?: string | null; email?: string | null } | null
  sharedBy?: { id: string; name?: string | null; email?: string | null } | null
  sharedWith?: Array<{ userId: string; user?: { id: string; name?: string | null; email?: string | null } | null }>
  createdAt?: string
  updatedAt?: string
}

export type UserNoteActivity = {
  id: string
  type?: string
  description?: string
  createdAt?: string
  userName?: string
}
