/**
 * POA Review Processing API Endpoint
 * 
 * Processes uploaded Excel/CSV files using the Python POA Review scripts
 * and returns a download URL for the generated report.
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { withHttp } from '../_lib/withHttp.js';
import { withLogging } from '../_lib/logger.js';
import { authRequired } from '../_lib/authRequired.js';
import { created, badRequest, serverError } from '../_lib/response.js';
import { parseJsonBody } from '../_lib/body.js';

const execAsync = promisify(exec);

async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return badRequest(res, 'Method not allowed');
        }

        const payload = await parseJsonBody(req);
        const { filePath, fileName, sources } = payload;

        console.log('POA Review API - Received payload:', { filePath, fileName, sources });

        if (!filePath || !fileName) {
            console.error('POA Review API - Missing required fields:', { filePath: !!filePath, fileName: !!fileName });
            return badRequest(res, 'filePath and fileName are required');
        }

        // Get root directory - same resolution as files.js
        // files.js uses: path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
        // Since we're in api/poa-review/, we need to go up two levels
        const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
        console.log('POA Review API - Root directory:', rootDir);
        console.log('POA Review API - Current file location:', new URL(import.meta.url).pathname);
        
        // Setup directories
        const inputDir = path.join(rootDir, 'uploads', 'poa-review-inputs');
        const outputDir = path.join(rootDir, 'uploads', 'poa-review-outputs');
        const scriptsDir = path.join(rootDir, 'scripts', 'poa-review');
        
        console.log('POA Review API - Directories:', { inputDir, outputDir, scriptsDir });
        
        // Ensure directories exist
        [inputDir, outputDir, scriptsDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log('POA Review API - Created directory:', dir);
            }
        });

        // Resolve file paths - handle both absolute and relative paths
        let inputFilePath;
        if (filePath.startsWith('/')) {
            // Absolute path from root (e.g., /uploads/poa-review-inputs/file.xlsx)
            inputFilePath = path.join(rootDir, filePath.slice(1));
        } else {
            // Relative path
            inputFilePath = path.join(rootDir, filePath);
        }
        
        console.log('POA Review API - Resolved input file path:', inputFilePath);
        console.log('POA Review API - File exists:', fs.existsSync(inputFilePath));
        
        if (!fs.existsSync(inputFilePath)) {
            console.error('POA Review API - File not found at:', inputFilePath);
            // List files in the input directory for debugging
            if (fs.existsSync(inputDir)) {
                const files = fs.readdirSync(inputDir);
                console.log('POA Review API - Files in input directory:', files);
            }
            return badRequest(res, `Uploaded file not found at: ${inputFilePath}`);
        }

        // Generate output filename
        const baseName = path.basename(fileName, path.extname(fileName));
        const timestamp = Date.now();
        const outputFileName = `${baseName}_review_${timestamp}.xlsx`;
        const outputFilePath = path.join(outputDir, outputFileName);

        // Copy Python scripts to scripts directory if they don't exist
        const formatExcelScript = path.join(scriptsDir, 'FormatExcel.py');
        const proofReviewScript = path.join(scriptsDir, 'ProofReview.py');

        // Check if scripts exist, if not, create them
        if (!fs.existsSync(formatExcelScript)) {
            // Create FormatExcel.py (you'll need to copy the actual content)
            // For now, we'll assume scripts are already in place
            console.warn('FormatExcel.py not found, please ensure scripts are in place');
        }

        // Create a temporary processing script that uses the uploaded file
        const tempProcessScript = path.join(scriptsDir, `process_${timestamp}.py`);
        
        // Create a Python script that processes the single file
        const pythonScript = `
import sys
import os
sys.path.insert(0, '${scriptsDir.replace(/\\/g, '/')}')

import pandas as pd
from FormatExcel import Formatter
from ProofReview import POAReview, format_review, review_cols

# Input and output paths
input_file = r'${inputFilePath.replace(/\\/g, '/')}'
output_file = r'${outputFilePath.replace(/\\/g, '/')}'
sources = ${JSON.stringify(sources || ['Inmine: Daily Diesel Issues'])}

try:
    # Read the Excel file
    print("Reading file...")
    data = pd.read_excel(input_file, skiprows=1)
    
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
        console.log('Executing Python script...');
        const pythonCommand = `python3 "${tempProcessScript}"`;
        
        const { stdout, stderr } = await execAsync(pythonCommand, {
            cwd: scriptsDir,
            maxBuffer: 10 * 1024 * 1024 // 10MB buffer
        });

        console.log('Python stdout:', stdout);
        if (stderr) {
            console.warn('Python stderr:', stderr);
        }

        // Clean up temp script
        if (fs.existsSync(tempProcessScript)) {
            fs.unlinkSync(tempProcessScript);
        }

        // Check if output file was created
        if (!fs.existsSync(outputFilePath)) {
            return serverError(res, 'Failed to generate output file. Check server logs for details.');
        }

        // Return download URL
        const downloadUrl = `/uploads/poa-review-outputs/${outputFileName}`;
        
        return created(res, {
            success: true,
            downloadUrl,
            fileName: outputFileName,
            message: 'File processed successfully'
        });

    } catch (error) {
        console.error('POA Review processing error:', error);
        return serverError(res, 'Processing failed', error.message);
    }
}

export default withHttp(withLogging(authRequired(handler)));

