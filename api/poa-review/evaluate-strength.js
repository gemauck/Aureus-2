/**
 * POA Review — server-side AI strength evaluation for browser runs.
 * Accepts aggregated batch summaries (not full file rows) and returns merged tiers.
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { withHttp } from '../_lib/withHttp.js';
import { withLogging } from '../_lib/logger.js';
import { authRequired } from '../_lib/authRequired.js';
import { badRequest, ok, serverError } from '../_lib/response.js';
import { parseJsonBody } from '../_lib/body.js';

function runStrengthCli(pythonPath, cliPath, stdinJson, env) {
    return new Promise((resolve, reject) => {
        const proc = spawn(pythonPath, [cliPath], {
            env,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });
        proc.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        proc.on('error', reject);
        proc.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(stderr.trim() || stdout.trim() || `Python exited ${code}`));
                return;
            }
            resolve(stdout.trim());
        });
        proc.stdin.write(stdinJson);
        proc.stdin.end();
    });
}

async function handler(req, res) {
    try {
        if (req.method === 'GET') {
            return ok(res, {
                available: Boolean(process.env.OPENAI_API_KEY && String(process.env.OPENAI_API_KEY).trim()),
            });
        }

        if (req.method !== 'POST') {
            return badRequest(res, 'Method not allowed');
        }

        const payload = await parseJsonBody(req);
        const { labelBatches, rulesResults } = payload || {};

        if (!labelBatches || typeof labelBatches !== 'object') {
            return badRequest(res, 'labelBatches is required');
        }
        if (!rulesResults || typeof rulesResults !== 'object') {
            return badRequest(res, 'rulesResults is required');
        }

        const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
        const scriptsDir = path.join(rootDir, 'scripts', 'poa-review');
        const cliPath = path.join(scriptsDir, 'evaluate_strength_cli.py');
        const venvPythonPath = path.join(rootDir, 'venv-poareview', 'bin', 'python3');
        const pythonPath = fs.existsSync(venvPythonPath) ? venvPythonPath : 'python3';
        const cacheDir = path.join(rootDir, 'uploads', 'poa-review-temp');

        if (!fs.existsSync(cliPath)) {
            return serverError(res, 'POA strength CLI not found on server');
        }

        const stdinJson = JSON.stringify({ labelBatches, rulesResults });
        const env = {
            ...process.env,
            POA_STRENGTH_CACHE_DIR: cacheDir,
        };

        const stdout = await runStrengthCli(pythonPath, cliPath, stdinJson, env);
        const lastLine = stdout.split('\n').filter(Boolean).pop();
        const result = JSON.parse(lastLine || stdout);

        return ok(res, result);
    } catch (error) {
        console.error('POA Review evaluate-strength error:', error);
        return serverError(res, error.message || 'Strength evaluation failed');
    }
}

export default withHttp(withLogging(authRequired(handler)));
