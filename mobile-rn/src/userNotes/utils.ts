import { stripHtml } from '../projects/utils'
import type { UserNote } from './types'

export function notePreview(note: Pick<UserNote, 'content' | 'title'>) {
  const text = stripHtml(note.content || '')
  if (text) return text.slice(0, 120)
  return note.title || 'Untitled note'
}

export function noteTags(note: UserNote): string[] {
  return Array.isArray(note.tags) ? note.tags.filter(Boolean) : []
}

export function allNoteTags(notes: UserNote[]): string[] {
  const set = new Set<string>()
  notes.forEach((n) => noteTags(n).forEach((t) => set.add(t)))
  return Array.from(set).sort((a, b) => a.localeCompare(b))
}

export function sortNotes(notes: UserNote[]): UserNote[] {
  return [...notes].sort((a, b) => {
    const aPin = Boolean(a.pinned)
    const bPin = Boolean(b.pinned)
    if (aPin !== bPin) return aPin ? -1 : 1
    const aT = new Date(a.updatedAt || a.createdAt || 0).getTime()
    const bT = new Date(b.updatedAt || b.createdAt || 0).getTime()
    return bT - aT
  })
}

export function filterNotes(notes: UserNote[], query: string, tagFilter: string): UserNote[] {
  const q = query.trim().toLowerCase()
  return notes.filter((note) => {
    if (tagFilter && !noteTags(note).includes(tagFilter)) return false
    if (!q) return true
    const hay = `${note.title || ''} ${stripHtml(note.content || '')} ${noteTags(note).join(' ')}`.toLowerCase()
    return hay.includes(q)
  })
}
