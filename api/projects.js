// Projects API endpoint
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
  try {
    console.log('🔍 Projects API Debug:', {
      method: req.method,
      url: req.url,
      headers: req.headers,
      user: req.user
    })
    
    const url = new URL(req.url, `http://${req.headers.host}`)
    const pathSegments = url.pathname.split('/').filter(Boolean)
    const id = pathSegments[pathSegments.length - 1]

    // List Projects (GET /api/projects)
    if (req.method === 'GET' && pathSegments.length === 2 && pathSegments[1] === 'projects') {
      try {
        const projects = await prisma.project.findMany({ 
          orderBy: { createdAt: 'desc' } 
        })
        console.log('✅ Projects retrieved successfully:', projects.length)
        return ok(res, projects)
      } catch (dbError) {
        console.error('❌ Database error listing projects:', dbError)
        return serverError(res, 'Failed to list projects', dbError.message)
      }
    }

    // Create Project (POST /api/projects)
    if (req.method === 'POST' && pathSegments.length === 2 && pathSegments[1] === 'projects') {
      const body = await parseJsonBody(req)
      if (!body.name) return badRequest(res, 'name required')

      const projectData = {
        name: body.name,
        description: body.description || '',
        client: body.client || '',
        status: body.status || 'Planning',
        startDate: body.startDate ? new Date(body.startDate) : new Date(),
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        budget: parseFloat(body.budget) || 0,
        priority: body.priority || 'Medium',
        tasks: Array.isArray(body.tasks) ? body.tasks : [],
        team: Array.isArray(body.team) ? body.team : [],
        notes: body.notes || '',
        ownerId: req.user?.sub || null
      }

      console.log('🔍 Creating project with data:', projectData)
      try {
        const project = await prisma.project.create({
          data: projectData
        })
        console.log('✅ Project created successfully:', project.id)
        return created(res, { project })
      } catch (dbError) {
        console.error('❌ Database error creating project:', dbError)
        return serverError(res, 'Failed to create project', dbError.message)
      }
    }

    // Get, Update, Delete Single Project (GET, PUT, DELETE /api/projects/[id])
    if (pathSegments.length === 3 && pathSegments[1] === 'projects' && id) {
      if (req.method === 'GET') {
        try {
          const project = await prisma.project.findUnique({ where: { id } })
          if (!project) return notFound(res)
          console.log('✅ Project retrieved successfully:', project.id)
          return ok(res, { project })
        } catch (dbError) {
          console.error('❌ Database error getting project:', dbError)
          return serverError(res, 'Failed to get project', dbError.message)
        }
      }
      if (req.method === 'PUT') {
        const body = await parseJsonBody(req)
        const updateData = {
          name: body.name,
          description: body.description,
          client: body.client,
          status: body.status,
          startDate: body.startDate ? new Date(body.startDate) : undefined,
          dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
          budget: body.budget,
          priority: body.priority,
          tasks: body.tasks,
          team: body.team,
          notes: body.notes
        }
        Object.keys(updateData).forEach(key => {
          if (updateData[key] === undefined) {
            delete updateData[key]
          }
        })
        
        console.log('🔍 Updating project with data:', updateData)
        try {
          const project = await prisma.project.update({ 
            where: { id }, 
            data: updateData 
          })
          console.log('✅ Project updated successfully:', project.id)
          return ok(res, { project })
        } catch (dbError) {
          console.error('❌ Database error updating project:', dbError)
          return serverError(res, 'Failed to update project', dbError.message)
        }
      }
      if (req.method === 'DELETE') {
        try {
          await prisma.project.delete({ where: { id } })
          console.log('✅ Project deleted successfully:', id)
          return ok(res, { deleted: true })
        } catch (dbError) {
          console.error('❌ Database error deleting project:', dbError)
          return serverError(res, 'Failed to delete project', dbError.message)
        }
      }
    }

    return badRequest(res, 'Invalid method or project action')
  } catch (e) {
    return serverError(res, 'Project handler failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
