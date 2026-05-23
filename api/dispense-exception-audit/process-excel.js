/**
 * Dispense Exception Audit — process uploaded InsightWare exception workbook.
 * Runs Python audit engine and returns summary + downloadable report.
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { withHttp } from '../_lib/withHttp.js';
import { withLogging } from '../_lib/logger.js';
import { authRequired } from '../_lib/authRequired.js';
import { badRequest, serverError, ok } from '../_lib/response.js';
import { createWriteStream } from 'fs';

const execAsync = promisify(exec);
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return badRequest(res, 'Method not allowed');
        }

        const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
        const inputDir = path.join(rootDir, 'uploads', 'dispense-exception-audit-inputs');
        const outputDir = path.join(rootDir, 'uploads', 'dispense-exception-audit-outputs');
        const scriptsDir = path.join(rootDir, 'scripts', 'dispense-exception-audit');
        [inputDir, outputDir, scriptsDir].forEach((dir) => {
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        });

        const venvPythonPath = path.join(rootDir, 'venv-poareview', 'bin', 'python3');
        const venvPython = fs.existsSync(venvPythonPath) ? venvPythonPath : 'python3';

        const Busboy = (await import('busboy')).default;
        const bb = Busboy({ headers: req.headers });
        let inputFilePath = null;
        let fileReceived = false;
        let writeStream = null;
        let timestamp = Date.now();
        let safeFileName = 'dispense_exception';

        await new Promise((resolve, reject) => {
            bb.on('file', (name, file, info) => {
                const { filename } = info;
                fileReceived = true;
                const ext = path.extname(filename).toLowerCase();
                if (!['.xlsx', '.xls'].includes(ext)) {
                    file.resume();
                    reject(new Error('Only Excel files (.xlsx, .xls) are supported'));
                    return;
                }
                timestamp = Date.now();
                safeFileName = path.basename(filename, ext).replace(/[^a-z0-9_-]/gi, '_').slice(0, 60);
                inputFilePath = path.join(inputDir, `${safeFileName}_${timestamp}${ext}`);
                writeStream = createWriteStream(inputFilePath);
                let totalBytes = 0;

                file.on('data', (chunk) => {
                    totalBytes += chunk.length;
                    if (totalBytes > MAX_FILE_SIZE_BYTES) {
                        file.destroy();
                        if (writeStream) {
                            writeStream.destroy();
                            try { fs.unlinkSync(inputFilePath); } catch (_) {}
                        }
                        reject(new Error(`File too large. Maximum size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`));
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
                writeStream.on('finish', resolve);
            });
            bb.on('error', reject);
            bb.on('finish', () => {
                if (!fileReceived) reject(new Error('No file uploaded'));
            });
            req.pipe(bb);
        });

        const outputFileName = `${safeFileName}_${timestamp}-audit.xlsx`;
        const outputFilePath = path.join(outputDir, outputFileName);
        const jsonPath = path.join(outputDir, `${safeFileName}_${timestamp}-audit.json`);
        const runScript = path.join(scriptsDir, 'runAudit.py');
        const pythonCmd = venvPython === 'python3'
            ? `python3 "${runScript}" "${inputFilePath}" -o "${outputFilePath}" --json "${jsonPath}" 2>&1`
            : `"${venvPython}" "${runScript}" "${inputFilePath}" -o "${outputFilePath}" --json "${jsonPath}" 2>&1`;

        let stdout = '';
        try {
            const result = await execAsync(pythonCmd, {
                cwd: scriptsDir,
                maxBuffer: 10 * 1024 * 1024,
                timeout: 600000,
            });
            stdout = result.stdout || '';
        } catch (execError) {
            const msg = [execError.stdout, execError.stderr, execError.message].filter(Boolean).join('\n');
            throw new Error(msg.substring(0, 2000));
        }

        if (!fs.existsSync(outputFilePath)) {
            throw new Error(`Audit output not created. Python output: ${stdout.substring(0, 1000)}`);
        }

        let payload = { summary: {}, findings: [] };
        if (fs.existsSync(jsonPath)) {
            payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        }

        try {
            if (inputFilePath && fs.existsSync(inputFilePath)) fs.unlinkSync(inputFilePath);
        } catch (_) {}

        const criticalFindings = (payload.findings || []).filter((f) => f.severity !== 'info');

        return ok(res, {
            success: true,
            downloadUrl: `/uploads/dispense-exception-audit-outputs/${outputFileName}`,
            fileName: outputFileName,
            summary: payload.summary || {},
            findings: payload.findings || [],
            criticalFindings,
        });
    } catch (error) {
        console.error('Dispense Exception Audit API error:', error);
        return serverError(res, error.message || 'Failed to process audit workbook');
    }
}

export default withHttp(withLogging(authRequired(handler)));
