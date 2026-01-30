/**
 * Cron: POST/GET /api/cron/document-collection-scheduled-send
 * Sends scheduled "request documents via email" for document collection cells.
 * Call with ?secret=CRON_SECRET or header x-cron-secret: CRON_SECRET.
 * Schedule: weekly = send if last sent > 7 days ago; monthly = send if not sent this month.
 * Stops when cell status equals the configured stopWhenStatus (e.g. "collected").
 */
import { prisma } from '../_lib/prisma.js';
import { sendEmail } from '../_lib/email.js';
import { ok, badRequest, serverError } from '../_lib/response.js';

const MS_WEEK = 7 * 24 * 60 * 60 * 1000;

function sameMonth(iso1, iso2) {
  if (!iso1 || !iso2) return false;
  const d1 = new Date(iso1);
  const d2 = new Date(iso2);
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth();
}

function htmlFromBody(body) {
  if (!body || typeof body !== 'string') return '';
  return body
    .split('\n')
    .map((l) => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'))
    .join('<br>');
}

async function handler(req, res) {
  const secret = process.env.CRON_SECRET || process.env.DOCUMENT_COLLECTION_CRON_SECRET;
  const provided =
    (req.query && req.query.secret) ||
    (req.headers && (req.headers['x-cron-secret'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '')));
  if (secret && provided !== secret) {
    return badRequest(res, 'Invalid or missing cron secret');
  }

  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const yearStr = String(currentYear);
    let sent = 0;
    const errors = [];

    const projects = await prisma.project.findMany({
      where: { hasDocumentCollectionProcess: true },
      select: { id: true, name: true, documentSections: true }
    });

    for (const project of projects) {
      let blob;
      try {
        const raw = project.documentSections;
        if (!raw) continue;
        blob = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch (e) {
        errors.push({ projectId: project.id, error: 'Invalid documentSections JSON' });
        continue;
      }
      if (!blob || typeof blob !== 'object' || Array.isArray(blob)) continue;

      const yearSections = blob[yearStr];
      if (!Array.isArray(yearSections)) continue;

      let blobModified = false;
      for (let si = 0; si < yearSections.length; si++) {
        const section = yearSections[si];
        const docs = section.documents || [];
        for (let di = 0; di < docs.length; di++) {
          const doc = docs[di];
          const emailByMonth = doc.emailRequestByMonth;
          if (!emailByMonth || typeof emailByMonth !== 'object') continue;

          const collectionStatus = doc.collectionStatus || {};
          for (const [monthKey, data] of Object.entries(emailByMonth)) {
            if (!data || typeof data !== 'object') continue;
            const schedule = data.schedule;
            if (!schedule || schedule.frequency === 'none' || !['weekly', 'monthly'].includes(schedule.frequency))
              continue;
            const recipients = Array.isArray(data.recipients) ? data.recipients : [];
            if (recipients.length === 0) continue;

            const status = collectionStatus[monthKey];
            if (status === schedule.stopWhenStatus) continue;

            const lastSentAt = data.lastSentAt ? new Date(data.lastSentAt).getTime() : 0;
            if (schedule.frequency === 'weekly' && lastSentAt && now.getTime() - lastSentAt < MS_WEEK) continue;
            if (schedule.frequency === 'monthly' && lastSentAt && sameMonth(data.lastSentAt, now.toISOString()))
              continue;

            const subject = (typeof data.subject === 'string' && data.subject.trim()) || 'Document request';
            const body = typeof data.body === 'string' ? data.body.trim() : '';
            const html = body ? htmlFromBody(body) : '';
            const text = body || '';

            for (const to of recipients) {
              if (!to || typeof to !== 'string') continue;
              const email = to.trim();
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
              try {
                await sendEmail({ to: email, subject, html, text });
                sent++;
              } catch (err) {
                errors.push({
                  projectId: project.id,
                  projectName: project.name,
                  monthKey,
                  email,
                  error: err.message || 'Send failed'
                });
              }
            }

            data.lastSentAt = now.toISOString();
            blobModified = true;
          }
        }
      }

      if (blobModified) {
        try {
          await prisma.project.update({
            where: { id: project.id },
            data: { documentSections: JSON.stringify(blob) }
          });
        } catch (updateErr) {
          errors.push({ projectId: project.id, error: 'Failed to update lastSentAt: ' + updateErr.message });
        }
      }
    }

    return ok(res, { sent, errors, projectsChecked: projects.length });
  } catch (e) {
    console.error('document-collection-scheduled-send error:', e);
    return serverError(res, e.message || 'Cron failed');
  }
}

export default handler;
