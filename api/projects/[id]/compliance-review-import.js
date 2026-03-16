/**
 * POST /api/projects/:id/compliance-review-import
 * Multipart: file (Excel .xlsx). Parses "File N: ..." as sections and column B as checklist items.
 * Returns { sections } for the frontend to merge into the selected year and save.
 */
import { authRequired } from '../../../_lib/authRequired.js';
import { ok, badRequest, serverError } from '../../../_lib/response.js';
import { parseComplianceExcel } from '../../../scripts/compliance-review-excel-parser.js';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).setHeader('Allow', 'POST').json({ error: 'Method not allowed' });
  }

  const id = (req.params && req.params.id) ? String(req.params.id).trim() : null;
  if (!id) {
    return badRequest(res, 'Project ID required');
  }

  try {
    const Busboy = (await import('busboy')).default;
    const bb = Busboy({ headers: req.headers, limits: { fileSize: MAX_FILE_SIZE_BYTES } });
    let fileBuffer = null;
    let fileReceived = false;

    await new Promise((resolve, reject) => {
      bb.on('file', (name, file, info) => {
        const { filename } = info;
        const ext = (filename && filename.toLowerCase().endsWith('.xlsx')) ? '.xlsx' : '';
        if (!ext) {
          file.resume();
          return;
        }
        fileReceived = true;
        const chunks = [];
        file.on('data', (chunk) => {
          chunks.push(chunk);
          if (chunks.reduce((n, c) => n + c.length, 0) > MAX_FILE_SIZE_BYTES) {
            file.destroy();
            reject(new Error(`File too large. Maximum size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`));
          }
        });
        file.on('end', () => {
          fileBuffer = Buffer.concat(chunks);
        });
        file.on('error', reject);
      });
      bb.on('finish', () => resolve());
      bb.on('error', reject);
      req.pipe(bb);
    });

    if (!fileReceived || !fileBuffer || fileBuffer.length === 0) {
      return badRequest(res, 'No Excel file uploaded. Please upload a .xlsx file.');
    }

    const { sections } = parseComplianceExcel(fileBuffer);
    return ok(res, { sections });
  } catch (e) {
    if (e.message && e.message.includes('File too large')) {
      return res.status(413).setHeader('Content-Type', 'application/json').end(
        JSON.stringify({ error: { message: e.message } })
      );
    }
    console.error('compliance-review-import error:', e);
    return serverError(res, 'Import failed', e.message);
  }
}

export default authRequired(handler);
