// Fix endpoint to clean up corrupted client data
import { authRequired } from '../../_lib/authRequired.js'
import { prisma } from '../../_lib/prisma.js'
import { ok, serverError, badRequest } from '../../_lib/response.js'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'

async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return badRequest(res, 'POST method required')
    }

    const clientId = req.params?.id
    if (!clientId) {
      return badRequest(res, 'Client ID required')
    }

    const { action } = req.body || {}
    
    if (!action || !['diagnose', 'cleanup-orphaned-memberships', 'fix-json-fields', 'full-fix'].includes(action)) {
      return badRequest(res, 'Valid action required: diagnose, cleanup-orphaned-memberships, fix-json-fields, or full-fix')
    }

    const results = {
      clientId,
      action,
      timestamp: new Date().toISOString(),
      operations: []
    }

    // Action 1: Diagnose
    if (action === 'diagnose' || action === 'full-fix') {
      try {
        // Check basic client
        const clientBasic = await prisma.client.findUnique({
          where: { id: clientId },
          select: { id: true, name: true, type: true, status: true }
        })
        
        if (!clientBasic) {
          return serverError(res, 'Client not found')
        }

        results.operations.push({
          step: 'diagnose-basic-client',
          success: true,
          message: 'Client found',
          data: clientBasic
        })

        // Check for orphaned group memberships
        const allMemberships = await prisma.clientCompanyGroup.findMany({
          where: { clientId },
          include: {
            group: {
              select: { id: true, name: true }
            }
          }
        })

        const orphanedMemberships = allMemberships.filter(m => !m.group)
        results.operations.push({
          step: 'diagnose-group-memberships',
          success: true,
          message: `Found ${allMemberships.length} total memberships, ${orphanedMemberships.length} orphaned`,
          orphanedCount: orphanedMemberships.length,
          orphanedIds: orphanedMemberships.map(m => ({ membershipId: m.id, groupId: m.groupId }))
        })

        // Check JSON fields
        const clientJson = await prisma.client.findUnique({
          where: { id: clientId },
          select: {
            contacts: true,
            sites: true,
            comments: true,
            followUps: true,
            activityLog: true,
            billingTerms: true,
            services: true
          }
        })

        const jsonFields = ['contacts', 'sites', 'comments', 'followUps', 'activityLog', 'billingTerms', 'services']
        const invalidFields = []

        for (const field of jsonFields) {
          const value = clientJson?.[field]
          if (value && typeof value === 'string') {
            try {
              JSON.parse(value)
            } catch (parseError) {
              invalidFields.push({ field, error: parseError.message })
            }
          }
        }

        results.operations.push({
          step: 'diagnose-json-fields',
          success: true,
          message: `Found ${invalidFields.length} invalid JSON fields`,
          invalidFields
        })

        if (action === 'diagnose') {
          return ok(res, results)
        }
      } catch (error) {
        results.operations.push({
          step: 'diagnose',
          success: false,
          error: error.message,
          code: error.code
        })
        if (action === 'diagnose') {
          return ok(res, results)
        }
      }
    }

    // Action 2: Cleanup orphaned memberships
    if (action === 'cleanup-orphaned-memberships' || action === 'full-fix') {
      try {
        const allMemberships = await prisma.clientCompanyGroup.findMany({
          where: { clientId },
          include: {
            group: {
              select: { id: true }
            }
          }
        })

        const orphanedMemberships = allMemberships.filter(m => !m.group)
        
        if (orphanedMemberships.length > 0) {
          const deletedIds = []
          for (const membership of orphanedMemberships) {
            try {
              await prisma.clientCompanyGroup.delete({
                where: { id: membership.id }
              })
              deletedIds.push(membership.id)
            } catch (deleteError) {
              console.error(`Failed to delete membership ${membership.id}:`, deleteError)
            }
          }

          results.operations.push({
            step: 'cleanup-orphaned-memberships',
            success: true,
            message: `Deleted ${deletedIds.length} orphaned group memberships`,
            deletedCount: deletedIds.length,
            deletedIds
          })
        } else {
          results.operations.push({
            step: 'cleanup-orphaned-memberships',
            success: true,
            message: 'No orphaned memberships found',
            deletedCount: 0
          })
        }
      } catch (error) {
        results.operations.push({
          step: 'cleanup-orphaned-memberships',
          success: false,
          error: error.message,
          code: error.code
        })
      }
    }

    // Action 3: Fix JSON fields
    if (action === 'fix-json-fields' || action === 'full-fix') {
      try {
        const clientJson = await prisma.client.findUnique({
          where: { id: clientId },
          select: {
            contacts: true,
            sites: true,
            comments: true,
            followUps: true,
            activityLog: true,
            billingTerms: true,
            services: true
          }
        })

        const jsonFields = ['contacts', 'sites', 'comments', 'followUps', 'activityLog', 'services']
        const updateData = {}
        const fixedFields = []

        for (const field of jsonFields) {
          const value = clientJson?.[field]
          if (value && typeof value === 'string') {
            try {
              JSON.parse(value)
              // Valid JSON, no fix needed
            } catch (parseError) {
              // Invalid JSON, set to empty array
              updateData[field] = '[]'
              fixedFields.push(field)
            }
          } else if (value === null || value === undefined) {
            updateData[field] = '[]'
            fixedFields.push(field)
          }
        }

        // Handle billingTerms separately (object, not array)
        if (clientJson?.billingTerms) {
          const value = clientJson.billingTerms
          if (typeof value === 'string') {
            try {
              JSON.parse(value)
            } catch (parseError) {
              updateData.billingTerms = JSON.stringify({
                paymentTerms: 'Net 30',
                billingFrequency: 'Monthly',
                currency: 'ZAR',
                retainerAmount: 0,
                taxExempt: false,
                notes: ''
              })
              fixedFields.push('billingTerms')
            }
          } else if (value === null || value === undefined) {
            updateData.billingTerms = JSON.stringify({
              paymentTerms: 'Net 30',
              billingFrequency: 'Monthly',
              currency: 'ZAR',
              retainerAmount: 0,
              taxExempt: false,
              notes: ''
            })
            fixedFields.push('billingTerms')
          }
        }

        if (Object.keys(updateData).length > 0) {
          await prisma.client.update({
            where: { id: clientId },
            data: updateData
          })

          results.operations.push({
            step: 'fix-json-fields',
            success: true,
            message: `Fixed ${fixedFields.length} invalid JSON fields`,
            fixedFields
          })
        } else {
          results.operations.push({
            step: 'fix-json-fields',
            success: true,
            message: 'No invalid JSON fields found',
            fixedFields: []
          })
        }
      } catch (error) {
        results.operations.push({
          step: 'fix-json-fields',
          success: false,
          error: error.message,
          code: error.code
        })
      }
    }

    // Verify fix worked
    if (action === 'full-fix') {
      try {
        // Try to query the client with includes
        const client = await prisma.client.findUnique({
          where: { id: clientId },
          include: {
            groupMemberships: {
              include: {
                group: {
                  select: {
                    id: true,
                    name: true,
                    type: true,
                    industry: true
                  }
                }
              }
            }
          }
        })

        if (client) {
          results.operations.push({
            step: 'verify-fix',
            success: true,
            message: 'Client can now be queried successfully with all includes',
            groupMembershipsCount: client.groupMemberships?.length || 0
          })
        }
      } catch (error) {
        results.operations.push({
          step: 'verify-fix',
          success: false,
          error: error.message,
          code: error.code,
          warning: 'Client may still have issues'
        })
      }
    }

    return ok(res, results)
  } catch (error) {
    console.error('❌ Fix endpoint error:', error)
    return serverError(res, 'Fix operation failed', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))

