import { withHttp } from '../_lib/withHttp.js';
import { withLogging } from '../_lib/logger.js';
import { authRequired } from '../_lib/authRequired.js';
import { badRequest, ok, serverError } from '../_lib/response.js';
import { parseJsonBody } from '../_lib/body.js';
import { prisma } from '../_lib/prisma.js';
import {
    loadPoaReviewSettings,
    normalizePoaReviewSettings,
    savePoaReviewSettings,
} from './_lib/poaReviewSettings.js';

async function handler(req, res) {
    try {
        if (req.method === 'GET') {
            const settings = await loadPoaReviewSettings(prisma);
            return ok(res, { settings });
        }
        if (req.method === 'PATCH' || req.method === 'POST') {
            const body = await parseJsonBody(req);
            const settings = normalizePoaReviewSettings(body?.settings ?? body);
            const userId = req.user?.id || req.user?.sub || null;
            const saved = await savePoaReviewSettings(prisma, settings, userId);
            return ok(res, { settings: saved });
        }
        return badRequest(res, 'Method not allowed');
    } catch (e) {
        console.error('POA settings API error:', e);
        if (String(e?.message || '').includes('poaReviewSettingsJson')) {
            return serverError(
                res,
                'Database missing poaReviewSettingsJson column. Run prisma/scripts/add-poa-review-settings.sql on the server.'
            );
        }
        return serverError(res, e.message || 'Failed to update POA settings');
    }
}

export default withHttp(withLogging(authRequired(handler)));
