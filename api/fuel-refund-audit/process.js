/**
 * Fuel Refund Report Audit — multipart Excel upload, Python audit, annotated workbook + JSON summary.
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

async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return badRequest(res, 'Method not allowed');
        }

        const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
        const inputDir = path.join(rootDir, 'uploads', 'fuel-refund-audit-inputs');
        const outputDir = path.join(rootDir, 'uploads', 'fuel-refund-audit-outputs');
        const auditDir = path.join(rootDir, 'scripts', 'fuel-refund-report-audit');
        [inputDir, outputDir, auditDir].forEach((dir) => {
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        });

        const venvPythonPath = path.join(rootDir, 'venv-poareview', 'bin', 'python3');
        const venvPython = fs.existsSync(venvPythonPath) ? venvPythonPath : 'python3';
        const runScript = path.join(auditDir, 'run_audit.py');

        const Busboy = (await import('busboy')).default;
        const bb = Busboy({ headers: req.headers });
        let inputFilePath = null;
        let fileName = null;
        let safeFileName = '';
        let timestamp = 0;
        let reportStage = 'checking';
        let enableV2 = false;
        let requirePumpReadings = false;
        let requireTankReadings = false;
        let requireConsumptionAssessment = false;
        let fileReceived = false;
        let writeStream = null;

        await new Promise((resolve, reject) => {
            let bbFinished = false;
            let streamFinished = false;

            bb.on('file', (name, file, info) => {
                const { filename } = info;
                fileName = filename;
                fileReceived = true;
                const ext = path.extname(filename).toLowerCase();
                if (!['.xlsx', '.xls'].includes(ext)) {
                    file.resume();
                    reject(new Error('Only Excel files (.xlsx, .xls) are supported'));
                    return;
                }
                timestamp = Date.now();
                safeFileName = path.basename(filename, ext).replace(/[^a-z0-9_-]/gi, '_').slice(0, 60);
                const inputFileName = `${safeFileName}_${timestamp}${ext}`;
                inputFilePath = path.join(inputDir, inputFileName);
                writeStream = fs.createWriteStream(inputFilePath);
                let totalBytes = 0;

                file.on('data', (chunk) => {
                    totalBytes += chunk.length;
                    if (totalBytes > MAX_FILE_SIZE_BYTES) {
                        file.destroy();
                        if (writeStream) {
                            writeStream.destroy();
                            try {
                                fs.unlinkSync(inputFilePath);
                            } catch (_) {
                                /* ignore */
                            }
                        }
                        reject(
                            new Error(
                                `File too large. Maximum size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`
                            )
                        );
                        return;
                    }
                    if (writeStream && !writeStream.destroyed) writeStream.write(chunk);
                });
                file.on('end', () => {
                    if (writeStream && !writeStream.destroyed) writeStream.end();
                });
                file.on('error', (err) => {
                    if (writeStream && !writeStream.destroyed) writeStream.destroy(err);
                });
                writeStream.on('error', reject);
                writeStream.on('finish', () => {
                    writeStream = null;
                    streamFinished = true;
                    if (bbFinished) resolve();
                });
            });

            bb.on('field', (name, value) => {
                if (name === 'reportStage' && ['checking', 'final'].includes(value)) {
                    reportStage = value;
                }
                if (name === 'enableV2' && (value === 'true' || value === '1')) {
                    enableV2 = true;
                }
                if (name === 'requirePumpReadings' && (value === 'true' || value === '1')) {
                    requirePumpReadings = true;
                }
                if (name === 'requireTankReadings' && (value === 'true' || value === '1')) {
                    requireTankReadings = true;
                }
                if (name === 'requireConsumptionAssessment' && (value === 'true' || value === '1')) {
                    requireConsumptionAssessment = true;
                }
            });

            bb.on('finish', () => {
                bbFinished = true;
                if (!fileReceived || streamFinished) resolve();
            });
            bb.on('error', reject);
            req.pipe(bb);
        });

        if (!fileReceived || !inputFilePath || !fs.existsSync(inputFilePath)) {
            return badRequest(res, 'No file uploaded');
        }

        const outputFileName = `${safeFileName}_audit_${timestamp}.xlsx`;
        const outputFilePath = path.join(outputDir, outputFileName);
        const jsonPath = path.join(outputDir, `${safeFileName}_audit_${timestamp}.json`);

        const pythonExec = venvPython === 'python3' ? 'python3' : `"${venvPython}"`;
        const args = [
            runScript,
            '--input',
            inputFilePath,
            '--output',
            outputFilePath,
            '--json',
            jsonPath,
            '--report-stage',
            reportStage,
        ];
        if (enableV2) args.push('--enable-v2');
        if (requirePumpReadings) args.push('--require-pump-readings');
        if (requireTankReadings) args.push('--require-tank-readings');
        if (requireConsumptionAssessment) args.push('--require-consumption-assessment');

        const quoted = args.map((arg) => `"${String(arg).replace(/"/g, '\\"')}"`).join(' ');
        const cmd = `${pythonExec} ${quoted} 2>&1`;

        let stdout = '';
        let exitCode = 0;
        try {
            const result = await execAsync(cmd, {
                cwd: auditDir,
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
            throw new Error(`Audit output was not created (exit ${exitCode}):\n${tail}`);
        }

        let summary = {};
        if (fs.existsSync(jsonPath)) {
            try {
                summary = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            } catch (e) {
                console.warn('Fuel Refund Audit API - could not parse JSON summary:', e.message);
            }
        }

        try {
            if (fs.existsSync(inputFilePath)) fs.unlinkSync(inputFilePath);
        } catch (cleanupError) {
            console.warn('Fuel Refund Audit API - cleanup error:', cleanupError);
        }

        const downloadUrl = `/uploads/fuel-refund-audit-outputs/${outputFileName}`;

        return ok(res, {
            success: true,
            downloadUrl,
            fileName: outputFileName,
            summary,
            reportStage,
            enableV2,
            requirePumpReadings,
            requireTankReadings,
            requireConsumptionAssessment,
            hasErrors: !!summary.has_errors,
            auditExitCode: exitCode,
            stdout: stdout.slice(-2000),
        });
    } catch (error) {
        console.error('Fuel Refund Audit API - Error:', error);
        const msg = error.message || String(error);
        if (!res.headersSent && !res.writableEnded) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
                JSON.stringify({
                    error: {
                        code: 'FUEL_REFUND_AUDIT_ERROR',
                        message: `Failed to process workbook: ${msg}`,
                    },
                })
            );
            return;
        }
    }
}

export default withHttp(withLogging(authRequired(handler)));
