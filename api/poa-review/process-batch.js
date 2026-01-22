/**
 * POA Review Batch Processing API Endpoint
 * 
 * Processes data in chunks to prevent server crashes with large files.
 * Accumulates results and generates final report when all batches are complete.
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { withHttp } from '../_lib/withHttp.js';
import { withLogging } from '../_lib/logger.js';
import { authRequired } from '../_lib/authRequired.js';
import { created, badRequest, serverError, ok } from '../_lib/response.js';
import { parseJsonBody } from '../_lib/body.js';

const execAsync = promisify(exec);

// Store batch data in memory (in production, use Redis or database)
const batchStore = new Map();

async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return badRequest(res, 'Method not allowed');
        }

        let payload;
        try {
            payload = await parseJsonBody(req);
        } catch (parseError) {
            console.error('POA Review Batch API - JSON parse error:', parseError);
            return badRequest(res, `Invalid JSON payload: ${parseError.message}`);
        }

        const { batchId, batchNumber, totalBatches, rows, sources, fileName, isFinal } = payload || {};

        console.log('POA Review Batch API - Received batch:', { 
            batchId, 
            batchNumber, 
            totalBatches, 
            rowCount: rows?.length,
            isFinal 
        });

        if (!batchId || !rows || !Array.isArray(rows)) {
            return badRequest(res, 'batchId and rows array are required');
        }

        // Get root directory
        const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
        const outputDir = path.join(rootDir, 'uploads', 'poa-review-outputs');
        const scriptsDir = path.join(rootDir, 'scripts', 'poa-review');
        const tempDir = path.join(rootDir, 'uploads', 'poa-review-temp');

        // Ensure directories exist
        [outputDir, scriptsDir, tempDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });

        // Initialize or get batch store
        if (!batchStore.has(batchId)) {
            batchStore.set(batchId, {
                batches: [],
                totalBatches: totalBatches || 1,
                sources: sources || ['Inmine: Daily Diesel Issues'],
                fileName: fileName || 'poa-review',
                receivedBatches: 0,
                startTime: Date.now()
            });
        }

        const batchData = batchStore.get(batchId);
        batchData.batches.push({
            batchNumber,
            rows
        });
        batchData.receivedBatches++;

        // If this is the final batch or we've received all batches, process everything
        const allBatchesReceived = isFinal || batchData.receivedBatches >= batchData.totalBatches;

        if (allBatchesReceived) {
            console.log('POA Review Batch API - All batches received, processing...', {
                batchId,
                totalBatches: batchData.receivedBatches,
                totalRows: batchData.batches.reduce((sum, b) => sum + b.rows.length, 0)
            });

            try {
                // Combine all batches into single array
                const allRows = batchData.batches
                    .sort((a, b) => a.batchNumber - b.batchNumber)
                    .flatMap(batch => batch.rows);

                console.log('POA Review Batch API - Combined rows:', allRows.length);

                // Create temporary CSV file for processing
                const tempCsvPath = path.join(tempDir, `${batchId}_data.csv`);
                
                // Write CSV header
                if (allRows.length > 0) {
                    const headers = Object.keys(allRows[0]).join(',');
                    const csvRows = allRows.map(row => {
                        return Object.values(row).map(val => {
                            // Escape commas and quotes in CSV
                            const str = String(val || '');
                            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                                return `"${str.replace(/"/g, '""')}"`;
                            }
                            return str;
                        }).join(',');
                    });
                    
                    const csvContent = [headers, ...csvRows].join('\n');
                    fs.writeFileSync(tempCsvPath, csvContent, 'utf8');
                    console.log('POA Review Batch API - Created temp CSV:', tempCsvPath);
                } else {
                    return badRequest(res, 'No data rows received');
                }

                // Convert CSV to Excel and process
                const timestamp = Date.now();
                const baseName = path.basename(batchData.fileName, path.extname(batchData.fileName));
                const outputFileName = `${baseName}_review_${timestamp}.xlsx`;
                const outputFilePath = path.join(outputDir, outputFileName);

                // Create Python script to process the CSV
                const tempProcessScript = path.join(scriptsDir, `process_batch_${batchId}_${timestamp}.py`);
                
                const pythonScript = `
import sys
import os
sys.path.insert(0, '${scriptsDir.replace(/\\/g, '/')}')

import pandas as pd
from FormatExcel import Formatter
from ProofReview import POAReview, format_review, review_cols

# Input and output paths
input_file = r'${tempCsvPath.replace(/\\/g, '/')}'
output_file = r'${outputFilePath.replace(/\\/g, '/')}'
sources = ${JSON.stringify(batchData.sources)}

def normalize_column_name(col_name):
    """Normalize column name for matching (case-insensitive, strip whitespace)"""
    if pd.isna(col_name):
        return None
    return str(col_name).strip().lower()

def find_column(df, target_name):
    """Find a column in the dataframe by normalized name"""
    normalized_target = normalize_column_name(target_name)
    for col in df.columns:
        if normalize_column_name(col) == normalized_target:
            return col
    return None

try:
    # Read the CSV file
    print("Reading CSV file...")
    data = pd.read_csv(input_file)
    
    print(f"Found columns: {list(data.columns)}")
    print(f"Total rows: {len(data)}")
    
    # Required columns and their normalized names
    required_columns = {
        "Transaction ID": ["transaction id", "transactionid", "txn id", "txnid"],
        "Asset Number": ["asset number", "assetnumber", "asset no", "assetno"],
        "Date & Time": ["date & time", "date and time", "datetime", "date", "timestamp"]
    }
    
    # Normalize column names - map actual columns to expected names
    column_mapping = {}
    missing_columns = []
    
    for expected_col, possible_names in required_columns.items():
        found_col = None
        # Try exact match first
        if expected_col in data.columns:
            found_col = expected_col
        else:
            # Try normalized matches
            for possible_name in possible_names:
                found_col = find_column(data, possible_name)
                if found_col:
                    break
        
        if found_col:
            if found_col != expected_col:
                print(f"Mapping column '{found_col}' to '{expected_col}'")
                column_mapping[found_col] = expected_col
        else:
            missing_columns.append(expected_col)
    
    # Report missing columns
    if missing_columns:
        available_cols = ", ".join([f"'{col}'" for col in data.columns])
        error_msg = f"Missing required columns: {', '.join(missing_columns)}.\\n"
        error_msg += f"Available columns in your file: {available_cols}\\n"
        raise ValueError(error_msg)
    
    # Rename columns to match expected names
    if column_mapping:
        print(f"Renaming columns: {column_mapping}")
        data = data.rename(columns=column_mapping)
    
    print("Initializing review...")
    review = POAReview(data)
    
    print("Marking no POA assets...")
    review.mark_no_poa_assets()
    
    print("Calculating time since last activity...")
    review.time_since_last_activity()
    
    print("Calculating total SMR...")
    review.total_smr(sources)
    
    print("Formatting review...")
    # Create output directory if it doesn't exist
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    
    # Format and save - pass output_path directly
    format_review(review.data, os.path.basename(input_file), output_file)
    
    print(f"Success! Output saved to: {output_file}")
    sys.exit(0)
except Exception as e:
    print(f"Error: {str(e)}", file=sys.stderr)
    import traceback
    traceback.print_exc(file=sys.stderr)
    sys.exit(1)
`;

                fs.writeFileSync(tempProcessScript, pythonScript);

                // Execute Python script
                console.log('POA Review Batch API - Executing Python script...');
                const venvPython = path.join(rootDir, 'venv-poareview', 'bin', 'python3');
                const pythonCommand = `"${venvPython}" "${tempProcessScript}" 2>&1`;
                
                let stdout, stderr;
                try {
                    const result = await execAsync(pythonCommand, {
                        cwd: scriptsDir,
                        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
                        timeout: 300000 // 5 minutes timeout
                    });
                    stdout = result.stdout;
                    stderr = result.stderr;
                } catch (execError) {
                    stdout = execError.stdout || '';
                    stderr = execError.stderr || execError.message || '';
                    console.error('POA Review Batch API - Python execution error:', execError);
                    throw new Error(`Python script execution failed: ${stderr || execError.message}`);
                }

                console.log('POA Review Batch API - Python script output:', stdout);

                // Check if output file was created
                if (!fs.existsSync(outputFilePath)) {
                    throw new Error(`Output file was not created. Python output: ${stdout}\nErrors: ${stderr}`);
                }

                // Clean up temp files
                try {
                    if (fs.existsSync(tempCsvPath)) fs.unlinkSync(tempCsvPath);
                    if (fs.existsSync(tempProcessScript)) fs.unlinkSync(tempProcessScript);
                } catch (cleanupError) {
                    console.warn('POA Review Batch API - Cleanup error:', cleanupError);
                }

                // Clean up batch store
                batchStore.delete(batchId);

                // Return download URL
                const downloadUrl = `/uploads/poa-review-outputs/${outputFileName}`;
                const processingTime = ((Date.now() - batchData.startTime) / 1000).toFixed(1);

                return ok(res, {
                    success: true,
                    downloadUrl,
                    fileName: outputFileName,
                    processingTime,
                    totalRows: allRows.length
                });

            } catch (error) {
                console.error('POA Review Batch API - Processing error:', error);
                batchStore.delete(batchId);
                return serverError(res, `Failed to process batches: ${error.message}`);
            }
        } else {
            // Return acknowledgment that batch was received
            return ok(res, {
                success: true,
                message: 'Batch received',
                batchNumber,
                receivedBatches: batchData.receivedBatches,
                totalBatches: batchData.totalBatches,
                progress: Math.round((batchData.receivedBatches / batchData.totalBatches) * 100)
            });
        }

    } catch (error) {
        console.error('POA Review Batch API - Error:', error);
        return serverError(res, `Internal server error: ${error.message}`);
    }
}

// Clean up old batch data periodically (every hour)
setInterval(() => {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    for (const [batchId, data] of batchStore.entries()) {
        if (data.startTime < oneHourAgo) {
            console.log('POA Review Batch API - Cleaning up old batch:', batchId);
            batchStore.delete(batchId);
        }
    }
}, 60 * 60 * 1000);

export default withHttp(withLogging(authRequired(handler)));

