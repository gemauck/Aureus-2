import { withHttp } from '../_lib/withHttp.js';
import { withLogging } from '../_lib/logger.js';
import { authRequired } from '../_lib/authRequired.js';
import { badRequest, ok, serverError } from '../_lib/response.js';
import { parseJsonBody } from '../_lib/body.js';
import { prisma } from '../_lib/prisma.js';
import { resolvePoaRoot, runPoaPythonScript } from './_lib/poaPython.js';
import { loadPoaReviewSettings, normalizePoaReviewSettings } from './_lib/poaReviewSettings.js';

const MAX_PREFLIGHT_ROWS = 25000;

async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return badRequest(res, 'Method not allowed');
        }
        const body = await parseJsonBody(req);
        const rows = body?.rows;
        if (!Array.isArray(rows) || rows.length === 0) {
            return badRequest(res, 'rows array is required');
        }
        if (rows.length > MAX_PREFLIGHT_ROWS) {
            return badRequest(
                res,
                `Pre-flight strength supports up to ${MAX_PREFLIGHT_ROWS.toLocaleString()} rows. Process the full file for the complete report.`
            );
        }

        const orgSettings = await loadPoaReviewSettings(prisma);
        const settings = normalizePoaReviewSettings({
            ...orgSettings,
            ...(body.settings || {}),
        });

        const rootDir = resolvePoaRoot();
        const result = await runPoaPythonScript(rootDir, 'preflight_strength.py', {
            rows,
            sources: body.sources || [],
            settings,
            columnMapping: body.columnMapping || {},
        });

        return ok(res, result);
    } catch (e) {
        console.error('POA preflight-strength error:', e);
        return serverError(res, e.message || 'Pre-flight strength evaluation failed');
    }
}

export default withHttp(withLogging(authRequired(handler)));
