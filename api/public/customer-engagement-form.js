import { ok, badRequest, forbidden, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { CUSTOMER_ENGAGEMENT_SCHEMA_VERSION, getCustomerEngagementFormDefinition } from '../_lib/customerEngagementSchema.js'

function allowPublicCustomerEngagement() {
  const v = (process.env.ALLOW_PUBLIC_CUSTOMER_ENGAGEMENT || 'true').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

async function handler(req, res) {
  try {
    if (!allowPublicCustomerEngagement()) {
      return forbidden(res, 'Customer engagement form is disabled.')
    }
    if (req.method !== 'GET') {
      return badRequest(res, 'Method not allowed')
    }
    const form = getCustomerEngagementFormDefinition()
    return ok(res, {
      schemaVersion: CUSTOMER_ENGAGEMENT_SCHEMA_VERSION,
      form
    })
  } catch (e) {
    console.error('public/customer-engagement-form:', e)
    return serverError(res, 'Request failed', e.message)
  }
}

export default withHttp(withLogging(handler))
