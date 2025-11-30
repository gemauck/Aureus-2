import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { ok, created, badRequest, notFound, serverError } from './_lib/response.js'

async function handler(req, res) {
  // Strip query parameters before splitting
  const urlPath = req.url.split('?')[0].split('#')[0]
  const pathSegments = urlPath.split('/').filter(Boolean)
  const id = pathSegments[pathSegments.length - 1]

  // LIST (GET /api/employees)
  if (req.method === 'GET' && pathSegments.length === 1 && pathSegments[0] === 'employees') {
    try {
      const employees = await prisma.employee.findMany({
        orderBy: { createdAt: 'desc' }
      })
      return ok(res, { employees })
    } catch (error) {
      console.error('❌ Failed to list employees:', error)
      return serverError(res, 'Failed to list employees', error.message)
    }
  }

  // GET ONE (GET /api/employees/:id)
  if (req.method === 'GET' && pathSegments.length === 2) {
    try {
      const employee = await prisma.employee.findUnique({
        where: { id }
      })
      
      if (!employee) {
        return notFound(res, 'Employee not found')
      }
      
      return ok(res, { employee })
    } catch (error) {
      console.error('❌ Failed to get employee:', error)
      return serverError(res, 'Failed to get employee', error.message)
    }
  }

  // CREATE (POST /api/employees)
  if (req.method === 'POST' && pathSegments.length === 1) {
    const body = req.body || {}
    
    if (!body.name || !body.email) {
      return badRequest(res, 'name and email required')
    }

    try {
      // Auto-generate employee number if not provided
      let employeeNumber = body.employeeNumber
      if (!employeeNumber) {
        const lastEmployee = await prisma.employee.findFirst({
          orderBy: { employeeNumber: 'desc' }
        })
        const nextNumber = lastEmployee 
          ? parseInt(lastEmployee.employeeNumber.replace('EMP', '')) + 1 
          : 1
        employeeNumber = `EMP${String(nextNumber).padStart(3, '0')}`
      }
      
      const employee = await prisma.employee.create({
        data: {
          employeeNumber,
          name: body.name,
          email: body.email,
          phone: body.phone || '',
          position: body.position || '',
          department: body.department || '',
          employmentDate: body.employmentDate ? new Date(body.employmentDate) : new Date(),
          idNumber: body.idNumber || '',
          taxNumber: body.taxNumber,
          bankName: body.bankName,
          accountNumber: body.accountNumber,
          branchCode: body.branchCode,
          salary: parseFloat(body.salary) || 0,
          status: body.status || 'Active',
          address: body.address || '',
          emergencyContact: body.emergencyContact || '',
          ownerId: req.user?.sub
        }
      })
      
      return created(res, { employee })
    } catch (error) {
      console.error('❌ Failed to create employee:', error)
      if (error.code === 'P2002') {
        return badRequest(res, 'Employee with this email or employee number already exists')
      }
      return serverError(res, 'Failed to create employee', error.message)
    }
  }

  // UPDATE (PATCH /api/employees/:id)
  if (req.method === 'PATCH' && pathSegments.length === 2) {
    const body = req.body || {}
    
    try {
      const updateData = {}
      
      // Only include fields that are provided
      if (body.name !== undefined) updateData.name = body.name
      if (body.email !== undefined) updateData.email = body.email
      if (body.phone !== undefined) updateData.phone = body.phone
      if (body.position !== undefined) updateData.position = body.position
      if (body.department !== undefined) updateData.department = body.department
      if (body.employmentDate !== undefined) updateData.employmentDate = new Date(body.employmentDate)
      if (body.idNumber !== undefined) updateData.idNumber = body.idNumber
      if (body.taxNumber !== undefined) updateData.taxNumber = body.taxNumber
      if (body.bankName !== undefined) updateData.bankName = body.bankName
      if (body.accountNumber !== undefined) updateData.accountNumber = body.accountNumber
      if (body.branchCode !== undefined) updateData.branchCode = body.branchCode
      if (body.salary !== undefined) updateData.salary = parseFloat(body.salary)
      if (body.status !== undefined) updateData.status = body.status
      if (body.address !== undefined) updateData.address = body.address
      if (body.emergencyContact !== undefined) updateData.emergencyContact = body.emergencyContact
      
      const employee = await prisma.employee.update({
        where: { id },
        data: updateData
      })
      
      return ok(res, { employee })
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
    try {
      await prisma.employee.delete({ 
        where: { id } 
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
