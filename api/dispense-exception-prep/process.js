/**
 * Dispense Exception Prep — multipart Excel upload with optional lookup workbooks.
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { withHttp } from '../_lib/withHttp.js';
import { withLogging } from '../_lib/logger.js';
import { authRequired } from '../_lib/authRequired.js';
import { badRequest, ok } from '../_lib/response.js';
import { requireDispenseExceptionPrepAccess } from '../_lib/dispenseExceptionPrepAccess.js';

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const execAsync = promisify(exec);

async function saveUploadedFile(file, info, dir, timestamp, label) {
    const { filename } = info;
    const ext = path.extname(filename).toLowerCase();
    if (!['.xlsx', '.xls'].includes(ext)) {
        file.resume();
        throw new Error(`${label}: only Excel files (.xlsx, .xls) are supported`);
    }
    const safe = path.basename(filename, ext).replace(/[^a-z0-9_-]/gi, '_').slice(0, 50);
    const outPath = path.join(dir, `${label}_${safe}_${timestamp}${ext}`);
    await new Promise((resolve, reject) => {
        const writeStream = fs.createWriteStream(outPath);
        let totalBytes = 0;
        file.on('data', (chunk) => {
            totalBytes += chunk.length;
            if (totalBytes > MAX_FILE_SIZE_BYTES) {
                file.destroy();
                writeStream.destroy();
                try {
                    fs.unlinkSync(outPath);
                } catch (_) {
                    /* ignore */
                }
                reject(
                    new Error(
                        `${label} too large. Maximum size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`
                    )
                );
                return;
            }
            if (!writeStream.destroyed) writeStream.write(chunk);
        });
        file.on('end', () => {
            if (!writeStream.destroyed) writeStream.end();
        });
        file.on('error', reject);
        writeStream.on('error', reject);
        writeStream.on('finish', resolve);
    });
    return outPath;
}

async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return badRequest(res, 'Method not allowed');
        }

        if (!(await requireDispenseExceptionPrepAccess(req, res))) {
            return;
        }

        const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
        const inputDir = path.join(rootDir, 'uploads', 'dispense-exception-prep-inputs');
        const outputDir = path.join(rootDir, 'uploads', 'dispense-exception-prep-outputs');
        const scriptDir = path.join(rootDir, 'scripts', 'dispense-exception-audit');
        [inputDir, outputDir, scriptDir].forEach((dir) => {
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        });

        const venvPythonPath = path.join(rootDir, 'venv-poareview', 'bin', 'python3');
        const venvPython = fs.existsSync(venvPythonPath) ? venvPythonPath : 'python3';
        const runScript = path.join(scriptDir, 'run_prepare.py');

        const Busboy = (await import('busboy')).default;
        const bb = Busboy({ headers: req.headers });
        const timestamp = Date.now();
        let workbookPath = null;
        let assetLookupPath = null;
        let avrSyncLookupPath = null;
        let priorPreparedPath = null;
        let economyThreshold = null;
        let siteName = '';
        let ruleProfile = '';
        let workbookName = '';
        let safeWorkbookName = '';
        const pendingWrites = [];

        await new Promise((resolve, reject) => {
            bb.on('file', (name, file, info) => {
                const field =
                    name === 'workbook' || name === 'file'
                        ? 'workbook'
                        : name === 'assetLookup'
                          ? 'assetLookup'
                          : name === 'avrSyncLookup'
                            ? 'avrSyncLookup'
                            : name === 'priorPrepared'
                              ? 'priorPrepared'
                              : null;
                if (!field) {
                    file.resume();
                    return;
                }
                const label =
                    field === 'workbook'
                        ? 'exception'
                        : field === 'assetLookup'
                          ? 'asset_lookup'
                          : field === 'avrSyncLookup'
                            ? 'avr_sync'
                            : 'prior_prepared';
                pendingWrites.push(
                    saveUploadedFile(file, info, inputDir, timestamp, label)
                        .then((savedPath) => {
                            if (field === 'workbook') {
                                workbookPath = savedPath;
                                workbookName = info.filename;
                                const ext = path.extname(info.filename).toLowerCase();
                                safeWorkbookName = path
                                    .basename(info.filename, ext)
                                    .replace(/[^a-z0-9_-]/gi, '_')
                                    .slice(0, 60);
                            } else if (field === 'assetLookup') {
                                assetLookupPath = savedPath;
                            } else if (field === 'avrSyncLookup') {
                                avrSyncLookupPath = savedPath;
                            } else {
                                priorPreparedPath = savedPath;
                            }
                        })
                        .catch(reject)
                );
            });

            bb.on('field', (name, value) => {
                if (name === 'economyThreshold' && value) {
                    const parsed = parseFloat(value);
                    if (!Number.isNaN(parsed)) economyThreshold = parsed;
                }
                if (name === 'siteName' && value) {
                    siteName = String(value).slice(0, 120);
                }
                if (name === 'ruleProfile' && value) {
                    ruleProfile = String(value).slice(0, 60);
                }
            });

            bb.on('finish', async () => {
                try {
                    await Promise.all(pendingWrites);
                    resolve();
                } catch (err) {
                    reject(err);
                }
            });
            bb.on('error', reject);
            req.pipe(bb);
        });

        if (!workbookPath || !fs.existsSync(workbookPath)) {
            return badRequest(res, 'No exception workbook uploaded');
        }

        const outputFileName = `${safeWorkbookName || 'dispense-exception'}_prepared_${timestamp}.xlsx`;
        const outputFilePath = path.join(outputDir, outputFileName);
        const jsonPath = path.join(outputDir, `${safeWorkbookName || 'dispense-exception'}_prepared_${timestamp}.json`);

        const pythonExec = venvPython === 'python3' ? 'python3' : `"${venvPython}"`;
        const args = [
            runScript,
            '--input',
            workbookPath,
            '--output',
            outputFilePath,
            '--json',
            jsonPath,
        ];
        if (assetLookupPath) {
            args.push('--asset-lookup', assetLookupPath);
        }
        if (avrSyncLookupPath) {
            args.push('--avr-sync-lookup', avrSyncLookupPath);
        }
        if (priorPreparedPath) {
            args.push('--prior-prepared', priorPreparedPath);
        }
        if (economyThreshold !== null) {
            args.push('--economy-threshold', String(economyThreshold));
        }
        if (siteName) {
            args.push('--site-name', siteName);
        }
        if (ruleProfile) {
            args.push('--rule-profile', ruleProfile);
        }

        const quoted = args.map((arg) => `"${String(arg).replace(/"/g, '\\"')}"`).join(' ');
        const cmd = `${pythonExec} ${quoted} 2>&1`;

        let stdout = '';
        let exitCode = 0;
        try {
            const result = await execAsync(cmd, {
                cwd: scriptDir,
                maxBuffer: 20 * 1024 * 1024,
                timeout: 600000,
            });
            stdout = result.stdout || '';
        } catch (execError) {
            stdout = [execError.stdout, execError.stderr].filter(Boolean).join('\n');
            exitCode = execError.code || 1;
        }

        if (!fs.existsSync(outputFilePath)) {
            const tail = stdout.length > 3000 ? stdout.slice(-3000) : stdout;
            throw new Error(`Prepared output was not created (exit ${exitCode}):\n${tail}`);
        }

        let summary = {};
        if (fs.existsSync(jsonPath)) {
            try {
                summary = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            } catch (e) {
                console.warn('Dispense Exception Prep API - could not parse JSON summary:', e.message);
            }
        }

        for (const cleanupPath of [
            workbookPath,
            assetLookupPath,
            avrSyncLookupPath,
            priorPreparedPath,
        ]) {
            try {
                if (cleanupPath && fs.existsSync(cleanupPath)) fs.unlinkSync(cleanupPath);
            } catch (cleanupError) {
                console.warn('Dispense Exception Prep API - cleanup error:', cleanupError);
            }
        }

        const downloadUrl = `/uploads/dispense-exception-prep-outputs/${outputFileName}`;

        return ok(res, {
            success: true,
            downloadUrl,
            fileName: outputFileName,
            sourceFileName: workbookName,
            summary,
            hasAssetLookup: !!assetLookupPath,
            hasAvrSyncLookup: !!avrSyncLookupPath,
            hasPriorPrepared: !!priorPreparedPath,
            prepExitCode: exitCode,
            stdout: stdout.slice(-2000),
        });
    } catch (error) {
        console.error('Dispense Exception Prep API - Error:', error);
        const msg = error.message || String(error);
        if (!res.headersSent && !res.writableEnded) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
                JSON.stringify({
                    error: {
                        code: 'DISPENSE_EXCEPTION_PREP_ERROR',
                        message: `Failed to prepare workbook: ${msg}`,
                    },
                })
            );
        }
    }
}

export default withHttp(withLogging(authRequired(handler)));
