// Diagnostic endpoint to check client data integrity
import { authRequired } from '../../_lib/authRequired.js'
import { prisma } from '../../_lib/prisma.js'
import { ok, serverError } from '../../_lib/response.js'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'

async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return serverError(res, 'Method not allowed')
    }

    const clientId = req.params?.id
    if (!clientId) {
      return serverError(res, 'Client ID required')
    }

    const diagnostics = {
      clientId,
      timestamp: new Date().toISOString(),
      checks: {}
    }

    // Check 1: Can we find the client at all?
    try {
      const clientBasic = await prisma.client.findUnique({
        where: { id: clientId },
        select: {
          id: true,
          name: true,
          type: true,
          status: true
        }
      })
      diagnostics.checks.basicClient = {
        success: true,
        found: !!clientBasic,
        data: clientBasic
      }
    } catch (error) {
      diagnostics.checks.basicClient = {
        success: false,
        error: error.message,
        code: error.code
      }
    }

    // Check 2: Can we query groupMemberships directly?
    try {
      const groupMemberships = await prisma.clientCompanyGroup.findMany({
        where: { clientId },
        include: {
          group: {
            select: {
              id: true,
              name: true,
              type: true
            }
          }
        }
      })
      diagnostics.checks.groupMemberships = {
        success: true,
        count: groupMemberships.length,
        data: groupMemberships.map(m => ({
          id: m.id,
          groupId: m.groupId,
          groupName: m.group?.name || 'MISSING GROUP',
          groupExists: !!m.group
        }))
      }

      // Check for orphaned memberships (groupId references non-existent group)
      const orphaned = groupMemberships.filter(m => !m.group)
      if (orphaned.length > 0) {
        diagnostics.checks.groupMemberships.orphaned = orphaned.map(m => ({
          membershipId: m.id,
          groupId: m.groupId,
          warning: 'Group does not exist'
        }))
      }
    } catch (error) {
      diagnostics.checks.groupMemberships = {
        success: false,
        error: error.message,
        code: error.code
      }
    }

    // Check 3: Can we query with include?
    try {
      const clientWithGroups = await prisma.client.findUnique({
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
      diagnostics.checks.clientWithGroups = {
        success: true,
        found: !!clientWithGroups,
        groupMembershipsCount: clientWithGroups?.groupMemberships?.length || 0
      }
    } catch (error) {
      diagnostics.checks.clientWithGroups = {
        success: false,
        error: error.message,
        code: error.code,
        stack: error.stack?.substring(0, 500)
      }
    }

    // Check 4: Check JSON fields for validity
    try {
      const clientJsonFields = await prisma.client.findUnique({
        where: { id: clientId },
        select: {
          id: true,
          contacts: true,
          sites: true,
          comments: true,
          followUps: true,
          activityLog: true,
          billingTerms: true,
          services: true
        }
      })

      if (clientJsonFields) {
        const jsonFields = ['contacts', 'sites', 'comments', 'followUps', 'activityLog', 'billingTerms', 'services']
        const jsonValidation = {}
        
        for (const field of jsonFields) {
          const value = clientJsonFields[field]
          try {
            if (value && typeof value === 'string') {
              JSON.parse(value)
              jsonValidation[field] = { valid: true, type: 'string', length: value.length }
            } else if (value === null || value === undefined) {
              jsonValidation[field] = { valid: true, type: 'null' }
            } else {
              jsonValidation[field] = { valid: true, type: typeof value }
            }
          } catch (parseError) {
            jsonValidation[field] = {
              valid: false,
              error: parseError.message,
              preview: value?.substring(0, 100)
            }
          }
        }
        
        diagnostics.checks.jsonFields = {
          success: true,
          validation: jsonValidation
        }
      }
    } catch (error) {
      diagnostics.checks.jsonFields = {
        success: false,
        error: error.message,
        code: error.code
      }
    }

    // Check 5: Try to get sites
    try {
      const clientForSites = await prisma.client.findUnique({
        where: { id: clientId },
        select: { sites: true }
      })
      
      if (clientForSites) {
        let sites = []
        try {
          if (typeof clientForSites.sites === 'string') {
            sites = JSON.parse(clientForSites.sites)
          } else if (Array.isArray(clientForSites.sites)) {
            sites = clientForSites.sites
          }
          diagnostics.checks.sites = {
            success: true,
            count: sites.length,
            valid: Array.isArray(sites)
          }
        } catch (parseError) {
          diagnostics.checks.sites = {
            success: false,
            error: 'Failed to parse sites JSON',
            parseError: parseError.message
          }
        }
      }
    } catch (error) {
      diagnostics.checks.sites = {
        success: false,
        error: error.message,
        code: error.code
      }
    }

    return ok(res, diagnostics)
  } catch (error) {
    console.error('❌ Diagnostic error:', error)
    return serverError(res, 'Diagnostic failed', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))

