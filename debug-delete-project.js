import { prisma } from './api/_lib/prisma.js'

/**
 * Debug helper to delete a project by ID using the same logic
 * as the /api/projects/[id].js DELETE handler, but with full
 * error logging to the console so we can see Prisma error codes/meta.
 *
 * Usage:
 *   node debug-delete-project.js <projectId>
 */
async function debugDeleteProject(id) {
  if (!id) {
    console.error('❌ Please provide a project ID')
    process.exit(1)
  }

  console.log('🧪 Debug deleting project with id:', id)

  try {
    const projectExists = await prisma.project.findUnique({ where: { id } })
    if (!projectExists) {
      console.error('❌ Project not found:', id)
      process.exit(1)
    }

    console.log('✅ Project exists, starting transaction...')

    await prisma.$transaction(async (tx) => {
      // Match the API logic as closely as possible

      // Tasks – clear parentTaskId then delete
      const tasksUpdated = await tx.task.updateMany({
        where: { projectId: id },
        data: { parentTaskId: null }
      })
      console.log('🔧 tasksUpdated:', tasksUpdated.count)

      const tasksDeleted = await tx.task.deleteMany({ where: { projectId: id } })
      console.log('🗑️ tasksDeleted:', tasksDeleted.count)

      // Task comments
      const taskCommentsDeleted = await tx.taskComment.deleteMany({ where: { projectId: id } })
      console.log('🗑️ taskCommentsDeleted:', taskCommentsDeleted.count)

      // Document & FMS sections
      const docSectionsDeleted = await tx.documentSection.deleteMany({ where: { projectId: id } })
      console.log('🗑️ documentSectionsDeleted:', docSectionsDeleted.count)

      const weeklySectionsDeleted = await tx.weeklyFMSReviewSection.deleteMany({ where: { projectId: id } })
      console.log('🗑️ weeklyFMSReviewSectionsDeleted:', weeklySectionsDeleted.count)

      const monthlySectionsDeleted = await tx.monthlyFMSReviewSection.deleteMany({ where: { projectId: id } })
      console.log('🗑️ monthlyFMSReviewSectionsDeleted:', monthlySectionsDeleted.count)

      // Invoices
      const invoicesDeleted = await tx.invoice.deleteMany({ where: { projectId: id } })
      console.log('🗑️ invoicesDeleted:', invoicesDeleted.count)

      // Time entries
      const timeEntriesDeleted = await tx.timeEntry.deleteMany({ where: { projectId: id } })
      console.log('🗑️ timeEntriesDeleted:', timeEntriesDeleted.count)

      // Tickets
      const ticketsDeleted = await tx.ticket.deleteMany({ where: { projectId: id } })
      console.log('🗑️ ticketsDeleted:', ticketsDeleted.count)

      // User tasks
      const userTasksDeleted = await tx.userTask.deleteMany({ where: { projectId: id } })
      console.log('🗑️ userTasksDeleted:', userTasksDeleted.count)

      // Finally delete the project
      const projectDeleted = await tx.project.delete({ where: { id } })
      console.log('🗑️ projectDeleted:', projectDeleted.id)
    })

    console.log('✅ Debug delete completed successfully')
    process.exit(0)
  } catch (error) {
    console.error('❌ Debug delete failed')
    console.error('Message:', error.message)
    console.error('Code:', error.code)
    console.error('Meta:', error.meta)
    console.error('Stack:', error.stack)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

const id = process.argv[2]
debugDeleteProject(id)








