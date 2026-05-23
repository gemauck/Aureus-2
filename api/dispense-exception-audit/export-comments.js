/**
 * Merge auditor comments into a dispense exception audit workbook.
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { withHttp } from '../_lib/withHttp.js';
import { withLogging } from '../_lib/logger.js';
import { authRequired } from '../_lib/authRequired.js';
import { badRequest, serverError, ok } from '../_lib/response.js';

const execAsync = promisify(exec);

async function readJsonBody(req) {
    if (req.body && typeof req.body === 'object') return req.body;
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    return raw ? JSON.parse(raw) : {};
}

async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return badRequest(res, 'Method not allowed');
        }

        const body = await readJsonBody(req);
        const fileName = path.basename(String(body.fileName || ''));
        const comments = body.comments && typeof body.comments === 'object' ? body.comments : {};
        const reviewTransactions = Array.isArray(body.reviewTransactions) ? body.reviewTransactions : [];

        if (!fileName || !fileName.endsWith('.xlsx')) {
            return badRequest(res, 'Valid audit fileName (.xlsx) is required');
        }

        const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
        const outputDir = path.join(rootDir, 'uploads', 'dispense-exception-audit-outputs');
        const outputPath = path.join(outputDir, fileName);
        const resolved = path.resolve(outputPath);
        if (!resolved.startsWith(path.resolve(outputDir)) || !fs.existsSync(resolved)) {
            return badRequest(res, 'Audit report not found. Run the audit again first.');
        }

        const scriptsDir = path.join(rootDir, 'scripts', 'dispense-exception-audit');
        const venvPythonPath = path.join(rootDir, 'venv-poareview', 'bin', 'python3');
        const venvPython = fs.existsSync(venvPythonPath) ? venvPythonPath : 'python3';

        const commentsPath = path.join(outputDir, `${fileName.replace(/\.xlsx$/i, '')}-comments.json`);
        const reviewPath = path.join(outputDir, `${fileName.replace(/\.xlsx$/i, '')}-review.json`);
        fs.writeFileSync(commentsPath, JSON.stringify(comments));
        fs.writeFileSync(reviewPath, JSON.stringify(reviewTransactions));

        const mergeScript = path.join(scriptsDir, '_merge_comments_once.py');
        const py = `import json, sys
sys.path.insert(0, ${JSON.stringify(scriptsDir.replace(/\\/g, '/'))})
from runAudit import merge_auditor_comments
with open(${JSON.stringify(commentsPath.replace(/\\/g, '/'))}) as f:
    comments = json.load(f)
with open(${JSON.stringify(reviewPath.replace(/\\/g, '/'))}) as f:
    review = json.load(f)
merge_auditor_comments(${JSON.stringify(resolved.replace(/\\/g, '/'))}, comments, review)
print("OK")
`;
        fs.writeFileSync(mergeScript, py);

        const pythonCmd = venvPython === 'python3'
            ? `python3 "${mergeScript}"`
            : `"${venvPython}" "${mergeScript}"`;

        await execAsync(pythonCmd, { cwd: scriptsDir, timeout: 120000 });

        try {
            fs.unlinkSync(mergeScript);
            fs.unlinkSync(commentsPath);
            fs.unlinkSync(reviewPath);
        } catch (_) {}

        return ok(res, {
            success: true,
            downloadUrl: `/uploads/dispense-exception-audit-outputs/${fileName}`,
            fileName,
        });
    } catch (error) {
        console.error('Dispense Exception Audit export-comments error:', error);
        return serverError(res, error.message || 'Failed to merge auditor comments');
    }
}

export default withHttp(withLogging(authRequired(handler)));
