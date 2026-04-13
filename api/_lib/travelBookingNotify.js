import { getAppUrl } from './getAppUrl.js'

function escapeHtml(text) {
  if (text == null) return ''
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function toolDeepLink(requestId = '') {
  const appBase = getAppUrl().replace(/\/$/, '')
  const base = `${appBase}/#/tools/travel-booking-requests`
  if (requestId) return `${base}?highlightRequest=${encodeURIComponent(requestId)}`
  return base
}

export async function notifyAssigneeNewTravelRequest({ request, requester, assignee }) {
  try {
    const { sendNotificationEmail } = await import('./email.js')
    const requesterName = escapeHtml(requester?.name || requester?.email || 'A staff member')
    const title = escapeHtml(request.tripTitle || 'Travel request')
    const subject = `Travel & accommodation request — ${title} — ${process.env.APP_NAME || 'Abcotronics ERP'}`
    const link = toolDeepLink(request.id)
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%); padding: 18px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 18px;">New travel booking request</h1>
        </div>
        <div style="padding: 24px; background: #f8fafc;">
          <p style="color: #334155; margin: 0 0 12px;">Hi ${escapeHtml(assignee?.name || 'there')},</p>
          <p style="color: #334155; margin: 0 0 12px;"><strong>${requesterName}</strong> nominated you to arrange flights and/or accommodation.</p>
          <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <p style="margin: 0 0 8px; color: #0f172a;"><strong>Trip</strong>: ${title}</p>
            <p style="margin: 0; color: #64748b; font-size: 13px;">Reference: <code>${escapeHtml(request.id)}</code></p>
          </div>
          <p style="margin: 16px 0 0;">
            <a href="${link}" style="display: inline-block; background: #0284c7; color: white; padding: 10px 18px; text-decoration: none; border-radius: 6px; font-weight: 600;">Open in ERP (Tools)</a>
          </p>
        </div>
      </div>
    `
    await sendNotificationEmail(assignee.email, subject, html, {
      userId: assignee.id,
      notificationType: 'system',
      notificationLink: link,
      notificationMetadata: {
        source: 'travel_booking_request',
        travelBookingRequestId: request.id,
        requesterId: requester.id
      }
    })
  } catch (e) {
    console.error('notifyAssigneeNewTravelRequest failed:', e?.message || e)
  }
}

export async function notifyRequesterTravelUpdate({ request, requester, assignee, prevStatus }) {
  try {
    const { sendNotificationEmail } = await import('./email.js')
    const assigneeName = escapeHtml(assignee?.name || assignee?.email || 'Bookings')
    const title = escapeHtml(request.tripTitle || 'Your travel request')
    const statusLabel = escapeHtml(request.status)
    const msg = request.messageToRequester ? escapeHtml(request.messageToRequester) : ''
    const subject = `Travel request updated (${statusLabel}) — ${process.env.APP_NAME || 'Abcotronics ERP'}`
    const link = toolDeepLink(request.id)
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #6366f1 0%, #4338ca 100%); padding: 18px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 18px;">Travel request update</h1>
        </div>
        <div style="padding: 24px; background: #f8fafc;">
          <p style="color: #334155; margin: 0 0 12px;">Hi ${escapeHtml(requester?.name || 'there')},</p>
          <p style="color: #334155; margin: 0 0 12px;"><strong>${assigneeName}</strong> updated your request <strong>${title}</strong>.</p>
          <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <p style="margin: 0 0 8px;"><strong>Status</strong>: ${statusLabel}</p>
            ${prevStatus && prevStatus !== request.status ? `<p style="margin: 0 0 8px; color: #64748b; font-size: 13px;">Previous: ${escapeHtml(prevStatus)}</p>` : ''}
            ${msg ? `<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e2e8f0;"><p style="margin: 0; white-space: pre-wrap; color: #334155;">${msg}</p></div>` : ''}
          </div>
          <p style="margin: 16px 0 0;">
            <a href="${link}" style="display: inline-block; background: #4f46e5; color: white; padding: 10px 18px; text-decoration: none; border-radius: 6px; font-weight: 600;">View in ERP</a>
          </p>
        </div>
      </div>
    `
    await sendNotificationEmail(requester.email, subject, html, {
      userId: requester.id,
      notificationType: 'system',
      notificationLink: link,
      notificationMetadata: {
        source: 'travel_booking_request_update',
        travelBookingRequestId: request.id,
        assigneeId: assignee.id,
        status: request.status
      }
    })
  } catch (e) {
    console.error('notifyRequesterTravelUpdate failed:', e?.message || e)
  }
}

export async function notifyRequesterTravelSubmitted({ request, requester }) {
  try {
    const { sendNotificationEmail } = await import('./email.js')
    const title = escapeHtml(request.tripTitle || 'Travel request')
    const subject = `Travel request submitted — ref ${request.id.slice(0, 8)}… — ${process.env.APP_NAME || 'Abcotronics ERP'}`
    const link = toolDeepLink(request.id)
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
        <div style="padding: 24px; background: #f8fafc;">
          <p style="color: #334155; margin: 0 0 12px;">Hi ${escapeHtml(requester?.name || 'there')},</p>
          <p style="color: #334155; margin: 0 0 12px;">Your travel & accommodation request <strong>${title}</strong> was submitted successfully.</p>
          <p style="color: #64748b; font-size: 13px; margin: 0 0 16px;">Reference: <code>${escapeHtml(request.id)}</code></p>
          <p style="margin: 0;">
            <a href="${link}" style="color: #0284c7;">View in ERP</a>
          </p>
        </div>
      </div>
    `
    await sendNotificationEmail(requester.email, subject, html, {
      userId: requester.id,
      notificationType: 'system',
      notificationLink: link,
      notificationMetadata: {
        source: 'travel_booking_request_submitted',
        travelBookingRequestId: request.id
      }
    })
  } catch (e) {
    console.error('notifyRequesterTravelSubmitted failed:', e?.message || e)
  }
}
