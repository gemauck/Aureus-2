import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

// Helper function to parse JSON fields from database responses
function parseUserNoteJsonFields(note) {
  try {
    const parsed = { ...note }
    
    // Parse tags from JSON string
    if (typeof parsed.tags === 'string' && parsed.tags) {
      try {
        parsed.tags = JSON.parse(parsed.tags)
      } catch (e) {
        parsed.tags = []
      }
    } else if (!parsed.tags) {
      parsed.tags = []
    }
    
    // Include sharedWith users if present
    if (note.sharedWith && Array.isArray(note.sharedWith)) {
      parsed.sharedWith = note.sharedWith.map(share => ({
        userId: share.userId,
        user: share.user ? {
          id: share.user.id,
          name: share.user.name,
          email: share.user.email
        } : null
      }))
    } else {
      parsed.sharedWith = []
    }
    
    return parsed
  } catch (error) {
    console.error(`❌ Error parsing note ${note.id}:`, error.message)
    return note
  }
}

async function handler(req, res) {
  try {
    const urlPath = req.url.split('?')[0].split('#')[0].replace(/^\/api\//, '')
    const pathSegments = urlPath.split('/').filter(Boolean)
    const noteId = req.params?.id || (pathSegments.length > 1 ? pathSegments[pathSegments.length - 1] : null)
    // JWT payload uses 'sub' for user ID, not 'id'
    const userId = req.user?.sub || req.user?.id

    if (!userId) {
      console.error('❌ User Notes API: No user ID found. req.user =', req.user)
      return badRequest(res, 'User not authenticated')
    }

    // Handle share endpoint: POST /api/user-notes/[id]/share
    if (req.method === 'POST' && pathSegments[pathSegments.length - 1] === 'share' && noteId) {
      try {
        const payload = await parseJsonBody(req)
        const { sharedWith } = payload

        if (!Array.isArray(sharedWith)) {
          return badRequest(res, 'sharedWith must be an array of user IDs')
        }

        // Verify note exists and belongs to user
        const existingNote = await prisma.userNote.findFirst({
          where: {
            id: noteId,
            ownerId: userId
          }
        })

        if (!existingNote) {
          return notFound(res, 'Note not found')
        }

        // Delete existing shares
        await prisma.userNoteShare.deleteMany({
          where: { noteId }
        })

        // Create new shares
        if (sharedWith.length > 0) {
          await prisma.userNoteShare.createMany({
            data: sharedWith.map(userIdToShare => ({
              noteId,
              userId: userIdToShare
            })),
            skipDuplicates: true
          })
        }

        // Return updated note
        const updatedNote = await prisma.userNote.findUnique({
          where: { id: noteId },
          include: {
            sharedWith: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true
                  }
                }
              }
            }
          }
        })

        return ok(res, { note: parseUserNoteJsonFields(updatedNote) })
      } catch (error) {
        console.error('Error sharing note:', error)
        return serverError(res, 'Failed to share note', error.message)
      }
    }

    // GET /api/user-notes - List all notes for the user (owned + shared)
    if (req.method === 'GET' && !noteId) {
      try {
        // Get notes owned by user
        const ownedNotes = await prisma.userNote.findMany({
          where: { ownerId: userId },
          include: {
            sharedWith: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true
                  }
                }
              }
            }
          },
          orderBy: {
            updatedAt: 'desc'
          }
        })

        // Get notes shared with user
        const sharedNotes = await prisma.userNoteShare.findMany({
          where: { userId },
          include: {
            note: {
              include: {
                owner: {
                  select: {
                    id: true,
                    name: true,
                    email: true
                  }
                },
                sharedWith: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        email: true
                      }
                    }
                  }
                }
              }
            }
          }
        })

        // Combine and format notes
        const allNotes = [
          ...ownedNotes.map(note => ({
            ...parseUserNoteJsonFields(note),
            isOwner: true
          })),
          ...sharedNotes.map(share => ({
            ...parseUserNoteJsonFields(share.note),
            isOwner: false,
            sharedBy: share.note.owner
          }))
        ]

        // Sort by updatedAt
        allNotes.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))

        return ok(res, { notes: allNotes })
      } catch (error) {
        console.error('Error fetching notes:', error)
        return serverError(res, 'Failed to fetch notes', error.message)
      }
    }

    // GET /api/user-notes/[id] - Get single note
    if (req.method === 'GET' && noteId) {
      try {
        // Check if user owns the note or has it shared
        const ownedNote = await prisma.userNote.findFirst({
          where: {
            id: noteId,
            ownerId: userId
          },
          include: {
            sharedWith: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true
                  }
                }
              }
            }
          }
        })

        if (ownedNote) {
          return ok(res, { note: parseUserNoteJsonFields(ownedNote) })
        }

        // Check if note is shared with user
        const sharedNote = await prisma.userNoteShare.findFirst({
          where: {
            noteId,
            userId
          },
          include: {
            note: {
              include: {
                owner: {
                  select: {
                    id: true,
                    name: true,
                    email: true
                  }
                },
                sharedWith: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        email: true
                      }
                    }
                  }
                }
              }
            }
          }
        })

        if (sharedNote) {
          return ok(res, { 
            note: {
              ...parseUserNoteJsonFields(sharedNote.note),
              isOwner: false,
              sharedBy: sharedNote.note.owner
            }
          })
        }

        return notFound(res, 'Note not found')
      } catch (error) {
        console.error('Error fetching note:', error)
        return serverError(res, 'Failed to fetch note', error.message)
      }
    }

    // POST /api/user-notes - Create new note
    if (req.method === 'POST' && !noteId) {
      try {
        const payload = await parseJsonBody(req)
        const {
          title,
          content = '',
          tags = []
        } = payload

        if (!title || !title.trim()) {
          return badRequest(res, 'Title is required')
        }

        const noteData = {
          title: title.trim(),
          content: content.trim(),
          tags: JSON.stringify(Array.isArray(tags) ? tags : []),
          ownerId: userId
        }

        const note = await prisma.userNote.create({
          data: noteData,
          include: {
            sharedWith: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true
                  }
                }
              }
            }
          }
        })

        return created(res, { note: parseUserNoteJsonFields(note) })
      } catch (error) {
        console.error('Error creating note:', error)
        return serverError(res, 'Failed to create note', error.message)
      }
    }

    // PUT /api/user-notes/[id] - Update note (only owner can update)
    if (req.method === 'PUT' && noteId) {
      try {
        const payload = await parseJsonBody(req)
        const {
          title,
          content,
          tags
        } = payload

        // Verify note exists and belongs to user
        const existingNote = await prisma.userNote.findFirst({
          where: {
            id: noteId,
            ownerId: userId
          }
        })

        if (!existingNote) {
          return notFound(res, 'Note not found or you do not have permission to update it')
        }

        const updateData = {}
        if (title !== undefined) updateData.title = title.trim()
        if (content !== undefined) updateData.content = content.trim()
        if (tags !== undefined) updateData.tags = JSON.stringify(Array.isArray(tags) ? tags : [])

        const note = await prisma.userNote.update({
          where: { id: noteId },
          data: updateData,
          include: {
            sharedWith: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true
                  }
                }
              }
            }
          }
        })

        return ok(res, { note: parseUserNoteJsonFields(note) })
      } catch (error) {
        console.error('Error updating note:', error)
        return serverError(res, 'Failed to update note', error.message)
      }
    }

    // DELETE /api/user-notes/[id] - Delete note (only owner can delete)
    if (req.method === 'DELETE' && noteId) {
      try {
        const note = await prisma.userNote.findFirst({
          where: {
            id: noteId,
            ownerId: userId
          }
        })

        if (!note) {
          return notFound(res, 'Note not found or you do not have permission to delete it')
        }

        await prisma.userNote.delete({
          where: { id: noteId }
        })

        return ok(res, { message: 'Note deleted successfully' })
      } catch (error) {
        console.error('Error deleting note:', error)
        return serverError(res, 'Failed to delete note', error.message)
      }
    }

    return badRequest(res, 'Method not allowed')
  } catch (error) {
    console.error('User notes API error:', error)
    return serverError(res, 'Internal server error', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))






