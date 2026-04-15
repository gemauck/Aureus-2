/**
 * Cron: POST/GET /api/cron/document-collection-scheduled-send
 * Sends scheduled "request documents via email" for document collection cells.
 * Call with ?secret=CRON_SECRET or header x-cron-secret: CRON_SECRET.
 * Schedule: weekly = send if last sent > 7 days ago; monthly = send if not sent this month.
 * Stops when cell status equals the configured stopWhenStatus (e.g. "collected").
 */
import crypto from 'crypto';
import { prisma } from '../_lib/prisma.js';
import { sendEmail } from '../_lib/email.js';
import { ok, badRequest, serverError } from '../_lib/response.js';
import { getAppUrl } from '../_lib/getAppUrl.js';

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

function buildDocumentCollectionErpLink(projectId, sectionId, documentId, monthKey, yearStr) {
  const base = getAppUrl().replace(/\/$/, '');
  const q = new URLSearchParams();
  q.set('tab', 'documentCollection');
  if (sectionId != null && String(sectionId) !== '') q.set('docSectionId', String(sectionId));
  if (documentId != null && String(documentId) !== '') q.set('docDocumentId', String(documentId));
  if (monthKey != null && String(monthKey) !== '') q.set('docMonth', String(monthKey));
  if (yearStr != null && String(yearStr) !== '') q.set('docYear', String(yearStr));
  return `${base}/#/projects/${encodeURIComponent(projectId)}?${q.toString()}`;
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

            let subject = (typeof data.subject === 'string' && data.subject.trim()) || 'Abco Document / Data request';
            const body = typeof data.body === 'string' ? data.body.trim() : '';
            const sectionIdForLink = section.id != null ? section.id : String(si);
            const erpCellUrl = buildDocumentCollectionErpLink(project.id, sectionIdForLink, doc.id, monthKey, yearStr);
            const htmlBody = body ? htmlFromBody(body) : '';
            const cc = Array.isArray(data.cc) ? data.cc.filter((e) => e && typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())) : [];

            const validTo = recipients.filter((e) => e && typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()));
            if (validTo.length === 0) continue;
            const inboundEmail = process.env.DOCUMENT_REQUEST_INBOUND_EMAIL || process.env.INBOUND_EMAIL_FOR_DOCUMENT_REQUESTS || '';
            const fromAddress = inboundEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inboundEmail.trim()) ? inboundEmail.trim() : undefined;
            const monthKeyMatch = typeof monthKey === 'string' && monthKey.match(/^(\d{4})-(\d{2})$/);
            const cronYear = monthKeyMatch ? parseInt(monthKeyMatch[1], 10) : currentYear;
            const cronMonth = monthKeyMatch ? parseInt(monthKeyMatch[2], 10) : null;
            const requestNumber =
              cronMonth >= 1 && cronMonth <= 12
                ? `DOC-${cronYear}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
                : null;
            if (requestNumber && !subject.includes(requestNumber)) {
              subject = `${subject.trim()} [Req ${requestNumber}]`;
            }
            const refFooter = requestNumber ? `\n\nRequest ref: ${requestNumber}` : '';
            const html = (() => {
              const base = htmlBody
                ? `${htmlBody}<p style="margin-top:18px;font-size:13px;color:#444;"><a href="${erpCellUrl.replace(/"/g, '&quot;')}">Open this request in the ERP (document collection)</a></p>`
                : `<p style="font-size:14px;"><a href="${erpCellUrl.replace(/"/g, '&quot;')}">Open this request in the ERP (document collection)</a></p>`;
              const refHtml = requestNumber
                ? `<p style="margin-top:12px;font-size:12px;color:#64748b;">Request ref: ${requestNumber}</p>`
                : '';
              return base + refHtml;
            })();
            const text = body
              ? `${body}\n\nOpen in ERP: ${erpCellUrl}${refFooter}`
              : `Open in ERP: ${erpCellUrl}${refFooter}`;
            const dom = inboundEmail && inboundEmail.includes('@') ? inboundEmail.split('@')[1] : 'local';
            const messageIdForReply = `docreq-${crypto.randomUUID()}@${dom}`;
            const docHeaders = {
              'Message-ID': `<${messageIdForReply}>`,
              ...(requestNumber ? { 'X-Abcotronics-Doc-Req': requestNumber } : {})
            };
            try {
              await sendEmail({
                to: validTo,
                cc: cc.length > 0 ? cc : undefined,
                subject,
                html,
                text,
                ...(fromAddress && { from: fromAddress }),
                ...(fromAddress && { replyTo: fromAddress }),
                headers: docHeaders
              });
              sent += validTo.length + cc.length;
              if (requestNumber && doc.id && cronMonth >= 1 && cronMonth <= 12) {
                const toJ = JSON.stringify(validTo.map((e) => e.trim()));
                const ccJ = JSON.stringify(cc.map((e) => e.trim()));
                try {
                  await prisma.documentCollectionEmailLog.create({
                    data: {
                      projectId: project.id,
                      documentId: doc.id,
                      year: cronYear,
                      month: cronMonth,
                      kind: 'sent',
                      ...(section.id != null ? { sectionId: String(section.id) } : {}),
                      subject: subject.slice(0, 1000),
                      bodyText: text.slice(0, 50000),
                      requestNumber,
                      toEmails: toJ,
                      ccEmails: ccJ
                    }
                  });
                  await prisma.documentRequestEmailSent.create({
                    data: {
                      messageId: messageIdForReply,
                      projectId: project.id,
                      documentId: doc.id,
                      year: cronYear,
                      month: cronMonth,
                      ...(section.id != null ? { sectionId: String(section.id) } : {}),
                      requestNumber,
                      toEmails: toJ,
                      ccEmails: ccJ
                    }
                  });
                } catch (persistErr) {
                  console.warn('document-collection-scheduled-send: persist log/RN failed', persistErr.message);
                }
              }
            } catch (err) {
              validTo.forEach((email) => {
                errors.push({
                  projectId: project.id,
                  projectName: project.name,
                  monthKey,
                  email: email.trim(),
                  error: err.message || 'Send failed'
                });
              });
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
