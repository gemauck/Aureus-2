import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { ok, created, badRequest, notFound, serverError, forbidden } from './_lib/response.js'
import { isAdminRole } from './_lib/authRoles.js'

const EMPLOYEE_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  department: true,
  jobTitle: true,
  phone: true,
  employeeNumber: true,
  position: true,
  employmentDate: true,
  idNumber: true,
  taxNumber: true,
  bankName: true,
  accountNumber: true,
  branchCode: true,
  salary: true,
  employmentStatus: true,
  address: true,
  emergencyContact: true,
  createdAt: true,
  updatedAt: true
}

function toEmployee(user) {
  return {
    ...user,
    userId: user.id
  }
}

async function requireAdmin(req, res) {
  const currentUserId = req.user?.sub || req.user?.id
  if (!currentUserId) {
    badRequest(res, 'User not authenticated')
    return null
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: currentUserId },
    select: { role: true }
  })

  if (!currentUser || !isAdminRole(currentUser.role)) {
    forbidden(res, 'Only administrators can manage employee records')
    return null
  }

  return currentUser
}

async function handler(req, res) {
  // Strip query parameters before splitting
  const urlPath = req.url.split('?')[0].split('#')[0]
  const pathSegments = urlPath.split('/').filter(Boolean)
  const id = pathSegments[pathSegments.length - 1]

  // LIST (GET /api/employees)
  if (req.method === 'GET' && pathSegments.length === 1 && pathSegments[0] === 'employees') {
    try {
      const users = await prisma.user.findMany({
        where: {
          status: { not: 'inactive' }
        },
        select: EMPLOYEE_SELECT,
        orderBy: { createdAt: 'desc' }
      })
      return ok(res, { employees: users.map(toEmployee) })
    } catch (error) {
      console.error('❌ Failed to list employees:', error)
      return serverError(res, 'Failed to list employees', error.message)
    }
  }

  // GET ONE (GET /api/employees/:id)
  if (req.method === 'GET' && pathSegments.length === 2) {
    try {
      const user = await prisma.user.findUnique({
        where: { id },
        select: EMPLOYEE_SELECT
      })
      
      if (!user) {
        return notFound(res, 'Employee not found')
      }
      
      return ok(res, { employee: toEmployee(user) })
    } catch (error) {
      console.error('❌ Failed to get employee:', error)
      return serverError(res, 'Failed to get employee', error.message)
    }
  }

  // CREATE (POST /api/employees)
  if (req.method === 'POST' && pathSegments.length === 1) {
    const authorized = await requireAdmin(req, res)
    if (!authorized) return
    const body = req.body || {}
    
    if (!body.name || !body.email) {
      return badRequest(res, 'name and email required')
    }

    try {
      // Auto-generate employee number if not provided
      let employeeNumber = body.employeeNumber
      if (!employeeNumber) {
        const lastEmployee = await prisma.user.findFirst({
          where: {
            employeeNumber: { not: null }
          },
          select: { employeeNumber: true },
          orderBy: { employeeNumber: 'desc' }
        })
        const nextNumber = lastEmployee 
          ? parseInt(lastEmployee.employeeNumber.replace('EMP', '')) + 1 
          : 1
        employeeNumber = `EMP${String(nextNumber).padStart(3, '0')}`
      }

      const bcrypt = await import('bcryptjs')
      const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase()
      const passwordHash = await bcrypt.default.hash(tempPassword, 10)

      const employee = await prisma.user.create({
        data: {
          name: body.name,
          email: body.email,
          passwordHash,
          provider: 'local',
          mustChangePassword: true,
          role: body.role || 'user',
          status: body.status || 'active',
          employeeNumber,
          phone: body.phone || '',
          position: body.position || '',
          jobTitle: body.position || '',
          department: body.department || '',
          employmentDate: body.employmentDate ? new Date(body.employmentDate) : null,
          idNumber: body.idNumber || '',
          taxNumber: body.taxNumber || null,
          bankName: body.bankName || null,
          accountNumber: body.accountNumber || null,
          branchCode: body.branchCode || null,
          salary: parseFloat(body.salary) || 0,
          employmentStatus: body.employmentStatus || body.status || 'Active',
          address: body.address || '',
          emergencyContact: body.emergencyContact || ''
        },
        select: EMPLOYEE_SELECT
      })
      
      return created(res, { employee: toEmployee(employee), tempPassword })
    } catch (error) {
      console.error('❌ Failed to create employee:', error)
      if (error.code === 'P2002') {
        return badRequest(res, 'Employee with this email or employee number already exists')
      }
      return serverError(res, 'Failed to create employee', error.message)
    }
  }

  // UPDATE (PATCH /api/employees/:id)
  if ((req.method === 'PATCH' || req.method === 'PUT') && pathSegments.length === 2) {
    const authorized = await requireAdmin(req, res)
    if (!authorized) return
    const body = req.body || {}
    
    try {
      const updateData = {}
      
      // Only include fields that are provided
      if (body.name !== undefined) updateData.name = body.name
      if (body.email !== undefined) updateData.email = body.email
      if (body.phone !== undefined) updateData.phone = body.phone
      if (body.position !== undefined) updateData.position = body.position
      if (body.position !== undefined) updateData.jobTitle = body.position
      if (body.role !== undefined) updateData.role = body.role
      if (body.department !== undefined) updateData.department = body.department
      if (body.employmentDate !== undefined) updateData.employmentDate = body.employmentDate ? new Date(body.employmentDate) : null
      if (body.idNumber !== undefined) updateData.idNumber = body.idNumber
      if (body.taxNumber !== undefined) updateData.taxNumber = body.taxNumber
      if (body.bankName !== undefined) updateData.bankName = body.bankName
      if (body.accountNumber !== undefined) updateData.accountNumber = body.accountNumber
      if (body.branchCode !== undefined) updateData.branchCode = body.branchCode
      if (body.salary !== undefined) updateData.salary = parseFloat(body.salary)
      if (body.status !== undefined) updateData.status = body.status
      if (body.employmentStatus !== undefined) updateData.employmentStatus = body.employmentStatus
      if (body.address !== undefined) updateData.address = body.address
      if (body.emergencyContact !== undefined) updateData.emergencyContact = body.emergencyContact
      if (body.employeeNumber !== undefined) updateData.employeeNumber = body.employeeNumber
      
      const employee = await prisma.user.update({
        where: { id },
        data: updateData,
        select: EMPLOYEE_SELECT
      })
      
      return ok(res, { employee: toEmployee(employee) })
    } catch (error) {
      console.error('❌ Failed to update employee:', error)
      if (error.code === 'P2025') {
        return notFound(res, 'Employee not found')
      }
      if (error.code === 'P2002') {
        return badRequest(res, 'Email already in use by another employee')
      }
      return serverError(res, 'Failed to update employee', error.message)
    }
  }

  // DELETE (DELETE /api/employees/:id)
  if (req.method === 'DELETE' && pathSegments.length === 2) {
    const authorized = await requireAdmin(req, res)
    if (!authorized) return
    try {
      await prisma.user.update({
        where: { id },
        data: {
          status: 'inactive',
          employmentStatus: 'Resigned'
        }
      })
      
      return ok(res, { deleted: true })
    } catch (error) {
      console.error('❌ Failed to delete employee:', error)
      if (error.code === 'P2025') {
        return notFound(res, 'Employee not found')
      }
      return serverError(res, 'Failed to delete employee', error.message)
    }
  }

  return badRequest(res, 'Invalid endpoint or method')
}

export default authRequired(handler)
