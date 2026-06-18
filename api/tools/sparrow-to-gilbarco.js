/**
 * Sparrow to Gilbarco — upload Fuel Dispense Report; outputs Gilbarco Transactions workbook.
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { withHttp } from '../_lib/withHttp.js';
import { withLogging } from '../_lib/logger.js';
import { authRequired } from '../_lib/authRequired.js';
import { badRequest, ok } from '../_lib/response.js';

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const execAsync = promisify(exec);

function safeBaseName(filename) {
    const ext = path.extname(filename).toLowerCase();
    const base = path.basename(filename, ext).replace(/[^a-z0-9_-]/gi, '_').slice(0, 60);
    return { ext, base };
}

async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return badRequest(res, 'Method not allowed');
        }

        const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
        const inputDir = path.join(rootDir, 'uploads', 'sparrow-to-gilbarco-inputs');
        const outputDir = path.join(rootDir, 'uploads', 'sparrow-to-gilbarco-outputs');
        const scriptDir = path.join(rootDir, 'scripts', 'dispense-to-transactions');
        [inputDir, outputDir].forEach((dir) => {
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        });

        const venvPythonPath = path.join(rootDir, 'venv-poareview', 'bin', 'python3');
        const venvPython = fs.existsSync(venvPythonPath) ? venvPythonPath : 'python3';
        const runScript = path.join(scriptDir, 'run_convert.py');

        const Busboy = (await import('busboy')).default;
        const bb = Busboy({ headers: req.headers });
        const timestamp = Date.now();
        let dispensePath = null;
        let fileReceived = false;
        let outputFormat = 'gilbarco';

        await new Promise((resolve, reject) => {
            let bbFinished = false;
            const pendingStreams = new Set();

            const maybeResolve = () => {
                if (bbFinished && pendingStreams.size === 0) resolve();
            };

            bb.on('field', (name, value) => {
                if (name === 'format' && typeof value === 'string') {
                    const normalized = value.trim().toLowerCase();
                    if (normalized === 'gilbarco' || normalized === 'winshuttle') {
                        outputFormat = normalized;
                    }
                }
            });

            bb.on('file', (name, file, info) => {
                const { filename } = info;
                const ext = path.extname(filename).toLowerCase();
                if (!['.xlsx', '.xls'].includes(ext)) {
                    file.resume();
                    reject(new Error('Only Excel files (.xlsx, .xls) are supported'));
                    return;
                }

                if (name !== 'dispense' && name !== 'dispenseFile') {
                    file.resume();
                    return;
                }

                const { base } = safeBaseName(filename);
                const targetPath = path.join(inputDir, `dispense_${base}_${timestamp}${ext}`);
                dispensePath = targetPath;
                fileReceived = true;

                const writeStream = fs.createWriteStream(targetPath);
                pendingStreams.add(writeStream);
                let totalBytes = 0;

                file.on('data', (chunk) => {
                    totalBytes += chunk.length;
                    if (totalBytes > MAX_FILE_SIZE_BYTES) {
                        file.destroy();
                        writeStream.destroy();
                        try {
                            fs.unlinkSync(targetPath);
                        } catch (_) {
                            /* ignore */
                        }
                        reject(
                            new Error(
                                `File too large. Maximum size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`
                            )
                        );
                        return;
                    }
                    if (!writeStream.destroyed) writeStream.write(chunk);
                });
                file.on('end', () => {
                    if (!writeStream.destroyed) writeStream.end();
                });
                file.on('error', (err) => {
                    if (!writeStream.destroyed) writeStream.destroy(err);
                });
                writeStream.on('error', reject);
                writeStream.on('finish', () => {
                    pendingStreams.delete(writeStream);
                    maybeResolve();
                });
            });

            bb.on('finish', () => {
                bbFinished = true;
                maybeResolve();
            });
            bb.on('error', reject);
            req.pipe(bb);
        });

        if (!fileReceived || !dispensePath || !fs.existsSync(dispensePath)) {
            return badRequest(res, 'Upload a Fuel Dispense Report (.xlsx).');
        }

        const jsonPath = path.join(outputDir, `sparrow-to-gilbarco_${timestamp}.json`);

        const pythonExec = venvPython === 'python3' ? 'python3' : `"${venvPython}"`;
        const args = [
            runScript,
            '--input',
            dispensePath,
            '--output-dir',
            outputDir,
            '--format',
            outputFormat,
            '--json',
            jsonPath,
        ];
        const quoted = args.map((arg) => `"${String(arg).replace(/"/g, '\\"')}"`).join(' ');
        const cmd = `${pythonExec} ${quoted} 2>&1`;

        let stdout = '';
        let exitCode = 0;
        try {
            const result = await execAsync(cmd, {
                cwd: scriptDir,
                maxBuffer: 20 * 1024 * 1024,
                timeout: 300000,
            });
            stdout = result.stdout || '';
        } catch (execError) {
            stdout = [execError.stdout, execError.stderr].filter(Boolean).join('\n');
            exitCode = execError.code || 1;
        }

        let summary = {};
        if (fs.existsSync(jsonPath)) {
            try {
                summary = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            } catch (e) {
                console.warn('Sparrow to Gilbarco API - could not parse JSON summary:', e.message);
            }
        }

        const outputFilePath = summary.output;
        if (!outputFilePath || !fs.existsSync(outputFilePath)) {
            const tail = stdout.length > 3000 ? stdout.slice(-3000) : stdout;
            throw new Error(`Conversion output was not created (exit ${exitCode}):\n${tail}`);
        }

        try {
            if (dispensePath && fs.existsSync(dispensePath)) fs.unlinkSync(dispensePath);
        } catch (cleanupError) {
            console.warn('Sparrow to Gilbarco API - cleanup error:', cleanupError);
        }

        const outputFileName = summary.output_file_name || path.basename(outputFilePath);
        const downloadUrl = `/uploads/sparrow-to-gilbarco-outputs/${encodeURIComponent(outputFileName)}`;

        return ok(res, {
            success: true,
            downloadUrl,
            fileName: outputFileName,
            summary,
            exitCode,
            stdout: stdout.slice(-2000),
            warnings: summary.warnings || [],
        });
    } catch (error) {
        console.error('Sparrow to Gilbarco API - Error:', error);
        const msg = error.message || String(error);
        if (!res.headersSent && !res.writableEnded) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
                JSON.stringify({
                    error: {
                        code: 'SPARROW_TO_GILBARCO_ERROR',
                        message: `Failed to convert workbook: ${msg}`,
                    },
                })
            );
            return;
        }
    }
}

export default withHttp(withLogging(authRequired(handler)));
