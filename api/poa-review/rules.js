import fs from 'fs';
import path from 'path';
import { withHttp } from '../_lib/withHttp.js';
import { withLogging } from '../_lib/logger.js';
import { authRequired } from '../_lib/authRequired.js';
import { ok, serverError } from '../_lib/response.js';
import { resolvePoaRoot } from './_lib/poaPython.js';

async function handler(req, res) {
    try {
        if (req.method !== 'GET') {
            return res.status(405).json({ error: 'Method not allowed' });
        }
        const rootDir = resolvePoaRoot();
        const rulesPath = path.join(rootDir, 'scripts', 'poa-review', 'poa_strength_rules.json');
        const raw = fs.readFileSync(rulesPath, 'utf8');
        const rules = JSON.parse(raw);
        const meta = rules.rulesMeta || {};
        return ok(res, {
            rulesMeta: {
                version: meta.version || meta.lastUpdated || 'unknown',
                lastUpdated: meta.lastUpdated || meta.version || '',
                description: meta.description || '',
            },
            defaultSettings: {
                smrUsageMaxPerActivity: rules.smrUsageMaxPerActivity ?? 1000,
                batchWindowHours: 1,
                shiftProofWindowHours: rules.shiftProofFallback?.windowHours ?? 24,
            },
        });
    } catch (e) {
        console.error('POA rules API error:', e);
        return serverError(res, e.message || 'Failed to load POA rules metadata');
    }
}

export default withHttp(withLogging(authRequired(handler)));
