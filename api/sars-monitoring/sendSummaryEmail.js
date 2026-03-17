/**
 * Send a summary email to Compliance team members when new SARS changes are found.
 * Uses SARS_MONITORING_TEAM_ID (default 'compliance') to resolve recipients.
 * Skips sending on first run (no prior successful run) to avoid flooding with historical items.
 */
import { prisma } from '../_lib/prisma.js'
import { sendEmail } from '../_lib/email.js'
import { getTeamMemberUserIds } from '../_lib/notifyTeamDiscussion.js'

const COMPLIANCE_TEAM_ID = process.env.SARS_MONITORING_TEAM_ID || 'compliance'

/**
 * @param {Array<{ id: string, title: string, url?: string, priority?: string, category?: string, publishedAt?: Date }>} newChanges
 * @param {{ skipFirstRun?: boolean }} [opts]
 */
export async function sendSarsSummaryEmail(newChanges, opts = {}) {
  if (!Array.isArray(newChanges) || newChanges.length === 0) return

  const { skipFirstRun = true } = opts

  if (skipFirstRun) {
    const priorRun = await prisma.sarsWebsiteChange.findFirst({
      orderBy: { createdAt: 'desc' },
      take: 1
    })
    if (!priorRun) {
      console.log('SARS summary email: skipping (first run – no prior changes in DB)')
      return
    }
  }

  const memberIds = await getTeamMemberUserIds(COMPLIANCE_TEAM_ID)
  if (memberIds.length === 0) {
    console.log('SARS summary email: no Compliance team members found for team id', COMPLIANCE_TEAM_ID)
    return
  }

  const users = await prisma.user.findMany({
    where: { id: { in: memberIds } },
    select: { email: true, name: true }
  })
  const emails = users.map((u) => u.email).filter((e) => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e).trim()))
  if (emails.length === 0) {
    console.log('SARS summary email: no valid emails for Compliance team members')
    return
  }

  const appUrl = (process.env.APP_URL || 'https://erp.abcotronics.co.za').replace(/\/$/, '')
  const teamPath = `#/teams/${encodeURIComponent(COMPLIANCE_TEAM_ID)}?tab=sars-monitoring&team=${encodeURIComponent(COMPLIANCE_TEAM_ID)}`
  const viewLink = `${appUrl}/${teamPath}`

  const n = newChanges.length
  const subject = `SARS website update: ${n} new change${n !== 1 ? 's' : ''}`

  const rows = newChanges
    .slice(0, 50)
    .map(
      (c) =>
        `<tr>
          <td style="padding:8px 12px; border-bottom:1px solid #eee;"><a href="${(c.url || '').replace(/"/g, '&quot;')}">${escapeHtml((c.title || 'Untitled').slice(0, 120))}</a></td>
          <td style="padding:8px 12px; border-bottom:1px solid #eee;">${escapeHtml((c.category || 'General').slice(0, 20))}</td>
          <td style="padding:8px 12px; border-bottom:1px solid #eee;">${escapeHtml((c.priority || 'Normal').slice(0, 20))}</td>
          <td style="padding:8px 12px; border-bottom:1px solid #eee;">${c.publishedAt ? new Date(c.publishedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</td>
        </tr>`
    )
    .join('')

  const html = `
    <h2>SARS website – new updates</h2>
    <p>${n} new change${n !== 1 ? 's' : ''} detected on the SARS website (public notices, legislation, news).</p>
    <table style="border-collapse:collapse; width:100%; max-width:800px;">
      <thead>
        <tr style="background:#f5f5f5;">
          <th style="text-align:left; padding:8px 12px;">Title</th>
          <th style="text-align:left; padding:8px 12px;">Category</th>
          <th style="text-align:left; padding:8px 12px;">Priority</th>
          <th style="text-align:left; padding:8px 12px;">Date</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${n > 50 ? `<p><em>Showing first 50 of ${n} changes.</em></p>` : ''}
    <p><a href="${viewLink}">View all in Teams → Compliance → SARS Monitoring</a></p>
  `

  const text = [
    `SARS website – ${n} new change(s).`,
    '',
    ...newChanges.slice(0, 50).map((c) => `- ${(c.title || 'Untitled').slice(0, 80)} ${c.url || ''}`),
    '',
    `View all: ${viewLink}`
  ].join('\n')

  try {
    await sendEmail({
      to: emails,
      subject,
      html,
      text
    })
    console.log('SARS summary email sent to', emails.length, 'recipient(s)')
  } catch (err) {
    console.error('SARS summary email failed:', err.message)
    throw err
  }
}

function escapeHtml(s) {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
