/**
 * POA Review Excel File Processing API Endpoint
 * 
 * Processes Excel files directly on the server using pandas (much faster than client-side parsing).
 * For large files (>10MB), this avoids slow client-side XLSX.js parsing.
 * Enforces file size and row limits to prevent server overload/crashes.
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { withHttp } from '../_lib/withHttp.js';
import { withLogging } from '../_lib/logger.js';
import { authRequired } from '../_lib/authRequired.js';
import { badRequest, serverError, ok } from '../_lib/response.js';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

// Limits to prevent server crash from huge documents
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB (matches UI)
const MAX_ROWS = 500000; // Reject if CSV/Excel has more rows to avoid OOM

const execAsync = promisify(exec);

async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return badRequest(res, 'Method not allowed');
        }

        // Resolve directories first so we can stream upload to disk
        const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
        const inputDir = path.join(rootDir, 'uploads', 'poa-review-inputs');
        const outputDir = path.join(rootDir, 'uploads', 'poa-review-outputs');
        const scriptsDir = path.join(rootDir, 'scripts', 'poa-review');
        [inputDir, outputDir, scriptsDir].forEach(dir => {
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        });

        // Resolve Python: use venv if present, otherwise system python3
        const venvPythonPath = path.join(rootDir, 'venv-poareview', 'bin', 'python3');
        const venvPython = fs.existsSync(venvPythonPath) ? venvPythonPath : 'python3';
        if (venvPython === 'python3') {
            console.log('POA Review Excel API - venv-poareview not found, using system python3');
        }

        // Parse multipart and stream file directly to disk (no full-file buffer in memory)
        const Busboy = (await import('busboy')).default;
        const bb = Busboy({ headers: req.headers });
        let inputFilePath = null;
        let fileName = null;
        let safeFileName = '';
        let timestamp = 0;
        let sources = ['Inmine: Daily Diesel Issues'];
        let useAIStrength = false;
        let fileReceived = false;
        let writeStream = null;

        await new Promise((resolve, reject) => {
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
                        reject(new Error(`File too large. Maximum size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB. Upload a smaller file or split your data.`));
                        return;
                    }
                    if (writeStream && !writeStream.destroyed) writeStream.write(chunk);
                });
                file.on('end', () => {
                    if (writeStream && !writeStream.destroyed) {
                        writeStream.end();
                    }
                });
                file.on('error', (err) => {
                    if (writeStream && !writeStream.destroyed) writeStream.destroy(err);
                });
                writeStream.on('error', (err) => reject(err));
                writeStream.on('finish', () => {
                    writeStream = null;
                    streamFinished = true;
                    if (bbFinished) resolve();
                });
            });

            let bbFinished = false;
            let streamFinished = false;
            bb.on('field', (name, value) => {
                if (name === 'sources') {
                    try {
                        sources = JSON.parse(value);
                    } catch (e) { /* keep default */ }
                }
                if (name === 'useAIStrength') {
                    useAIStrength = value === 'true' || value === true;
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

        if (!fileName) {
            return badRequest(res, 'No filename provided');
        }

        const ext = path.extname(fileName).toLowerCase();
        const fileSize = fs.statSync(inputFilePath).size;
        if (fileSize > MAX_FILE_SIZE_BYTES) {
            try { fs.unlinkSync(inputFilePath); } catch (_) {}
            return res.status(413).setHeader('Content-Type', 'application/json').end(JSON.stringify({
                error: {
                    code: 'POA_FILE_TOO_LARGE',
                    message: `File too large. Maximum size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB. Upload a smaller file or split your data.`
                }
            }));
        }

        console.log('POA Review Excel API - File saved (streamed):', inputFilePath, 'Size:', fileSize, 'bytes');

        // Generate output filename
        const outputFileName = `${safeFileName}_review_${timestamp}.xlsx`;
        const outputFilePath = path.join(outputDir, outputFileName);

        // For large files, convert Excel to CSV first to avoid memory issues
        // Then use the batch processing API which handles large files efficiently
        const tempCsvPath = path.join(inputDir, `${safeFileName}_${timestamp}.csv`);
        const cacheDir = path.join(rootDir, 'uploads', 'poa-review-temp');
        const convertScriptPath = path.join(scriptsDir, 'convert_excel_for_poa.py');
        const processScriptPath = path.join(scriptsDir, 'process_poa_csv.py');
        const pythonExec = venvPython === 'python3' ? 'python3' : `"${venvPython}"`;

        const runPythonScript = async (scriptArgs, { timeout = 600000, label = 'Python' } = {}) => {
            const quoted = scriptArgs.map((arg) => `"${String(arg).replace(/"/g, '\\"')}"`).join(' ');
            const cmd = `${pythonExec} ${quoted} 2>&1`;
            try {
                const result = await execAsync(cmd, {
                    cwd: scriptsDir,
                    maxBuffer: 20 * 1024 * 1024,
                    timeout,
                });
                return { stdout: result.stdout || '', stderr: result.stderr || '', exitCode: 0 };
            } catch (execError) {
                return {
                    stdout: execError.stdout || '',
                    stderr: execError.stderr || '',
                    exitCode: execError.code || 1,
                    message: execError.message || '',
                };
            }
        };

        const throwIfPythonFailed = (run, stepLabel) => {
            const combined = [run.stdout, run.stderr].filter(Boolean).join('\n').trim();
            if (run.exitCode === 0) return combined;
            const tail = combined.length > 4000 ? combined.slice(-4000) : combined;
            console.error(`POA Review Excel API - ${stepLabel} failed:`, {
                exitCode: run.exitCode,
                message: run.message,
                output: tail,
            });
            const detail = tail || run.message || 'Unknown Python error';
            const snippet = detail.length > 3000 ? detail.slice(-3000) : detail;
            throw new Error(`${stepLabel} failed (exit code ${run.exitCode}):\n${snippet}`);
        };

        // Step 1: Convert Excel to CSV (header row detection matches browser pre-flight)
        console.log('POA Review Excel API - Converting Excel to CSV...');
        const convertRun = await runPythonScript(
            [convertScriptPath, inputFilePath, tempCsvPath],
            { timeout: 300000, label: 'convert' }
        );
        const convertOutput = throwIfPythonFailed(convertRun, 'Excel conversion');
        console.log('POA Review Excel API - Conversion output:', convertOutput.substring(0, 500));

        // Step 2: Process CSV with shared POA pipeline script
        console.log('POA Review Excel API - Processing CSV with Python...');
        const processRun = await runPythonScript(
            [
                processScriptPath,
                tempCsvPath,
                outputFilePath,
                JSON.stringify(sources),
                useAIStrength ? 'true' : 'false',
                cacheDir,
                String(MAX_ROWS),
            ],
            { timeout: 600000, label: 'process' }
        );
        const processOutput = throwIfPythonFailed(processRun, 'POA processing');
        console.log('POA Review Excel API - Python script output:', processOutput.substring(0, 500));

        // Check if output file was created
        if (!fs.existsSync(outputFilePath)) {
            throw new Error(`Output file was not created. Python output: ${processOutput}`);
        }

        // Clean up temp files
        try {
            if (fs.existsSync(inputFilePath)) fs.unlinkSync(inputFilePath);
            if (fs.existsSync(tempCsvPath)) fs.unlinkSync(tempCsvPath);
        } catch (cleanupError) {
            console.warn('POA Review Excel API - Cleanup error:', cleanupError);
        }

        // Return download URL
        const downloadUrl = `/uploads/poa-review-outputs/${outputFileName}`;

        return ok(res, {
            success: true,
            downloadUrl,
            fileName: outputFileName
        });

    } catch (error) {
        console.error('POA Review Excel API - Error:', error);
        let msg = error.message || String(error);
        const isFileTooLarge = msg.includes('File too large') || error.code === 'POA_FILE_TOO_LARGE';
        const isTooManyRows = msg.includes('too many rows') || (msg.includes('Maximum') && msg.includes('rows are supported'));
        // Exit code 137 = process killed (SIGKILL), usually by OOM killer when file is too large for server memory
        const isKilledOOM = msg.includes('exit code 137') || msg.includes('Killed');
        if (isKilledOOM) {
            msg = 'This file is too large for the server to process (it ran out of memory). Please use a smaller file, or split your data into multiple files (e.g. by month), then run POA Review on each.';
        }
        if (!res.headersSent && !res.writableEnded) {
            if (isFileTooLarge) {
                res.statusCode = 413;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                    error: { code: 'POA_FILE_TOO_LARGE', message: msg }
                }));
                return;
            }
            if (isTooManyRows) {
                res.statusCode = 413;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                    error: { code: 'POA_TOO_MANY_ROWS', message: msg }
                }));
                return;
            }
            if (isKilledOOM) {
                res.statusCode = 503;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                    error: { code: 'POA_SERVER_MEMORY', message: msg }
                }));
                return;
            }
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
                error: { code: 'POA_PROCESS_ERROR', message: `Failed to process Excel file: ${msg}`, details: msg }
            }));
            return;
        }
        return serverError(res, `Failed to process Excel file: ${msg}`);
    }
}

export default withHttp(withLogging(authRequired(handler)));

