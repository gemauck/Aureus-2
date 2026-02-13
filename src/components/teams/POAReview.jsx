/**
 * POA Review Component - Proof of Activity Review Tool
 * 
 * This component provides a UI for uploading fuel transaction data files
 * and downloading formatted review reports with compliance analysis.
 * Server enforces file size (50MB) and row limits to avoid overload.
 */

const { useState, useCallback } = React;

// Must match server limits (api/poa-review/process-excel.js and process-batch.js)
const MAX_FILE_SIZE_MB = 50;
const MAX_ROWS = 400000;

// Max rows to scan when detecting sources from uploaded file (keeps UI responsive)
const SOURCE_DETECT_MAX_ROWS = 5000;

const POAReview = () => {
    const { isDark } = window.useTheme || (() => ({ isDark: false }));
    
    const [uploadedFile, setUploadedFile] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingProgress, setProcessingProgress] = useState('');
    const [error, setError] = useState(null);
    const [downloadUrl, setDownloadUrl] = useState(null);
    const [sources, setSources] = useState([]);
    const [newSource, setNewSource] = useState('');
    const [processingProgressPercent, setProcessingProgressPercent] = useState(0);
    const [documentSources, setDocumentSources] = useState([]);
    const [sourcesDetecting, setSourcesDetecting] = useState(false);

    const handleFileSelect = useCallback((event) => {
        const file = event.target.files?.[0];
        if (file) {
            const validExtensions = ['.xlsx', '.xls', '.csv'];
            const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
            if (!validExtensions.includes(fileExtension)) {
                setError('Please upload an Excel file (.xlsx, .xls) or CSV file');
                return;
            }
            const maxSize = MAX_FILE_SIZE_MB * 1024 * 1024;
            if (file.size > maxSize) {
                setError(`File size must be less than ${MAX_FILE_SIZE_MB}MB to avoid server overload.`);
                return;
            }
            setUploadedFile(file);
            setError(null);
            setDownloadUrl(null);
            setDocumentSources([]);
            setSources([]);
            setSourcesDetecting(true);
            // Detect sources from document (sample) then update documentSources
            detectSourcesFromFile(file).then((unique) => {
                setDocumentSources(unique);
                setSourcesDetecting(false);
            }).catch((err) => {
                console.warn('POA Review - Source detection failed:', err);
                setDocumentSources([]);
                setSourcesDetecting(false);
            });
        }
    }, []);

    // Parse Excel/CSV file client-side and convert to JSON rows (optional maxRows to limit for source detection)
    const parseFileToRows = useCallback(async (file, maxRows = null) => {
        const fileName = file.name.toLowerCase();
        const isCSV = fileName.endsWith('.csv');
        const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

        if (isCSV) {
            // Parse CSV
            const text = await new Promise((resolve, reject) => {
            const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsText(file);
            });

            const lines = text.trim().split('\n');
            if (lines.length < 2) {
                throw new Error('CSV must have at least a header row and one data row');
            }

            const headers = lines[0].split(',').map(h => h.trim());
            const rows = [];

            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                // Simple CSV parsing (handles quoted fields)
                const values = [];
                let current = '';
                let inQuotes = false;

                for (let j = 0; j < line.length; j++) {
                    const char = line[j];
                    if (char === '"') {
                        if (inQuotes && line[j + 1] === '"') {
                            current += '"';
                            j++;
                        } else {
                            inQuotes = !inQuotes;
                        }
                    } else if (char === ',' && !inQuotes) {
                        values.push(current.trim());
                        current = '';
                    } else {
                        current += char;
                    }
                }
                values.push(current.trim());

                if (values.length === headers.length) {
                    const row = {};
                    headers.forEach((header, idx) => {
                        row[header] = values[idx] || '';
                    });
                    rows.push(row);
                    if (maxRows != null && rows.length >= maxRows) break;
                }
            }

            return maxRows != null ? rows.slice(0, maxRows) : rows;
        } else if (isExcel) {
            // Parse Excel using XLSX.js
            let XLSXLib = window.XLSX;
            if (!XLSXLib || !XLSXLib.utils) {
                // Wait for XLSX to load
                for (let i = 0; i < 30 && (!XLSXLib || !XLSXLib.utils); i++) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    XLSXLib = window.XLSX;
                }
            }

            if (!XLSXLib || !XLSXLib.utils) {
                throw new Error('Excel file support requires xlsx library. Please refresh the page.');
            }

            const arrayBuffer = await file.arrayBuffer();
            console.log('POA Review - Excel file size:', file.size, 'bytes');
            
            const workbook = XLSXLib.read(arrayBuffer, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            
            // Get the range of the worksheet to see how many rows Excel thinks there are
            const range = XLSXLib.utils.decode_range(worksheet['!ref'] || 'A1');
            const excelRowCount = range.e.r + 1; // Excel is 1-indexed, range.e.r is 0-indexed
            console.log('POA Review - Excel worksheet range:', worksheet['!ref'], 'Total rows in Excel:', excelRowCount);
            
            // CRITICAL: Excel files often have title rows before headers
            // The Python script uses skiprows=1, meaning it skips the first row
            // We need to find the actual header row by looking for required columns
            const rawData = XLSXLib.utils.sheet_to_json(worksheet, { 
                header: 1, // Get as array of arrays
                defval: '',
                raw: false
            });
            
            console.log('POA Review - Raw data rows from XLSX:', rawData.length);
            console.log('POA Review - Expected rows from Excel range:', excelRowCount);
            
            if (rawData.length === 0) {
                throw new Error('Excel file appears to be empty');
            }
            
            if (rawData.length < excelRowCount) {
                console.warn(`POA Review - WARNING: XLSX parsed ${rawData.length} rows but Excel shows ${excelRowCount} rows. Some rows may have been skipped.`);
            }
            
            // Find the header row by looking for required columns
            // Required columns: "Transaction ID", "Asset Number", "Date & Time"
            const requiredKeywords = ['transaction', 'asset', 'date', 'time'];
            let headerRowIndex = -1;
            let headers = [];
            
            // Check first 5 rows to find header row
            for (let i = 0; i < Math.min(5, rawData.length); i++) {
                const row = rawData[i] || [];
                const rowStr = row.join(' ').toLowerCase();
                
                // Check if this row contains required keywords
                const hasRequiredKeywords = requiredKeywords.some(keyword => 
                    rowStr.includes(keyword)
                );
                
                if (hasRequiredKeywords) {
                    headerRowIndex = i;
                    headers = row.map(h => String(h || '').trim());
                    break;
                }
            }
            
            // If no header row found, use first row (fallback)
            if (headerRowIndex === -1) {
                console.warn('POA Review - Could not find header row, using first row');
                headerRowIndex = 0;
                headers = (rawData[0] || []).map(h => String(h || '').trim());
            }
            
            // Data rows start after the header row (optionally limit for source detection)
            const dataRowsRaw = rawData.slice(headerRowIndex + 1);
            const dataRows = maxRows != null ? dataRowsRaw.slice(0, maxRows) : dataRowsRaw;
            console.log('POA Review - Data rows after slicing (excluding header):', dataRows.length);
            
            // Filter out empty column headers and handle duplicates (like pandas does)
            const validHeaderIndices = [];
            const validHeaders = [];
            const headerCounts = {}; // Track how many times we've seen each header
            
            headers.forEach((header, idx) => {
                const trimmed = String(header || '').trim();
                if (trimmed && trimmed !== '' && !trimmed.match(/^Unnamed:/i)) {
                    validHeaderIndices.push(idx);
                    
                    // Handle duplicate column names like pandas does
                    // First occurrence: "Location"
                    // Second occurrence: "Location.1"
                    // Third occurrence: "Location.2", etc.
                    let finalHeader = trimmed;
                    if (headerCounts[trimmed] !== undefined) {
                        headerCounts[trimmed]++;
                        finalHeader = `${trimmed}.${headerCounts[trimmed]}`;
                    } else {
                        headerCounts[trimmed] = 0; // First occurrence, next will be .1
                    }
                    
                    validHeaders.push(finalHeader);
                }
            });
            
            if (validHeaders.length === 0) {
                throw new Error('No valid column headers found in Excel file. Please ensure the file has a header row with column names.');
            }
            
            // Convert to array of objects with proper column names (only valid columns)
            const rowsAfterLengthCheck = dataRows.filter(row => row && row.length > 0);
            console.log('POA Review - Rows after length check:', rowsAfterLengthCheck.length);
            
            const rowsAfterMapping = rowsAfterLengthCheck.map(row => {
                const rowObj = {};
                validHeaders.forEach((header, validIdx) => {
                    const origIdx = validHeaderIndices[validIdx];
                    rowObj[header] = row[origIdx] !== undefined ? String(row[origIdx] || '').trim() : '';
                });
                return rowObj;
            });
            console.log('POA Review - Rows after mapping to objects:', rowsAfterMapping.length);
            
            const rows = rowsAfterMapping.filter(row => {
                // Filter out rows that are completely empty
                return Object.values(row).some(val => val && val.trim() !== '');
            });
            
            console.log('POA Review - Rows after filtering empty rows:', rows.length);
            console.log('POA Review - Rows filtered out:', rowsAfterMapping.length - rows.length);
            
            // Log column names for debugging
            console.log('POA Review - Header row index:', headerRowIndex);
            console.log('POA Review - Parsed Excel columns (filtered):', validHeaders);
            console.log('POA Review - Total data rows (final):', rows.length);
            if (rows.length > 0) {
                console.log('POA Review - First row sample:', rows[0]);
            }
            
            if (rows.length === 0) {
                throw new Error('No data rows found in Excel file after parsing. Please check the file format.');
            }
            
            return rows;
        } else {
            throw new Error('Unsupported file type. Please use CSV or Excel files.');
        }
    }, []);

    const getUniqueSourceValuesFromRows = useCallback((rows) => {
        if (!rows || rows.length === 0) return [];
        const sourceKey = Object.keys(rows[0]).find(k => /^source$/i.test(String(k).trim()));
        if (!sourceKey) return [];
        const set = new Set();
        rows.forEach(row => {
            const v = row[sourceKey];
            if (v != null && String(v).trim() !== '') set.add(String(v).trim());
        });
        return Array.from(set).sort();
    }, []);

    const detectSourcesFromFile = useCallback(async (file) => {
        const rows = await parseFileToRows(file, SOURCE_DETECT_MAX_ROWS);
        return getUniqueSourceValuesFromRows(rows);
    }, [parseFileToRows, getUniqueSourceValuesFromRows]);

    // Server limit (must match api/poa-review/process-batch.js MAX_TOTAL_ROWS)
    const MAX_POA_ROWS = 250000;

    // Process file in chunks using batch API
    const handleChunkedUpload = useCallback(async (rows, fileName) => {
        const totalRows = rows.length;
        if (totalRows > MAX_POA_ROWS) {
            setError(`This file has too many rows (${totalRows.toLocaleString()}). Maximum ${MAX_POA_ROWS.toLocaleString()} rows are supported. Please split your file (e.g. by month) and run POA Review on each file separately.`);
            setProcessing(false);
            setProcessingProgress('');
            setProcessingProgressPercent(0);
            return;
        }
        // Use larger batch size for large files to reduce round-trips (server allows up to 25k/ batch)
        let BATCH_SIZE = 500; // Default batch size
        if (totalRows > 50000) {
            BATCH_SIZE = 3500; // Fewer requests for very large files, still safe for server
        } else if (totalRows > 10000) {
            BATCH_SIZE = 1000;
        }
        const totalBatches = Math.ceil(totalRows / BATCH_SIZE);
        const batchId = `poa_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        console.log('POA Review - Batch configuration:', {
            totalRows,
            batchSize: BATCH_SIZE,
            totalBatches
        });

        console.log('POA Review - Starting chunked upload:', {
            totalRows,
            totalBatches,
            batchId,
            fileName
        });

        setProcessingProgress(`Processing ${totalRows} rows in ${totalBatches} batches...`);
        setProcessingProgressPercent(0);

        try {
            // Send batches sequentially (await each one before sending the next)
            console.log('POA Review - Starting batch loop, totalBatches:', totalBatches);
            for (let i = 0; i < totalBatches; i++) {
                const start = i * BATCH_SIZE;
                const end = Math.min(start + BATCH_SIZE, totalRows);
                const batch = rows.slice(start, end);
                const batchNumber = i + 1;
                const isFinal = batchNumber === totalBatches;

                console.log(`POA Review - Preparing batch ${batchNumber}/${totalBatches}`, {
                    batchSize: batch.length,
                    isFinal,
                    batchId
                });

                setProcessingProgress(`Sending batch ${batchNumber} of ${totalBatches} (${end} of ${totalRows} rows)...`);
                setProcessingProgressPercent(Math.round((batchNumber / totalBatches) * 50)); // 50% for sending

                console.log(`POA Review - Sending batch ${batchNumber}/${totalBatches} to server...`);
                
                // Retry logic for 401 (auth), 502/503/504 errors (server/gateway errors)
                let batchResponse;
                let retries = 0;
                const maxRetries = 3;
                const retryDelay = 2000; // 2 seconds between retries
                
                // Helper function to get fresh token
                const getAuthToken = () => window.storage?.getToken?.() || '';
                
                // Helper function to refresh token
                const refreshToken = async () => {
                    try {
                        const refreshUrl = '/api/auth/refresh';
                        const refreshRes = await fetch(refreshUrl, { 
                            method: 'POST', 
                            credentials: 'include', 
                            headers: { 'Content-Type': 'application/json' }
                        });
                        
                        if (refreshRes.ok) {
                            const text = await refreshRes.text();
                            const refreshData = text ? JSON.parse(text) : {};
                            const newToken = refreshData?.data?.accessToken || refreshData?.accessToken;
                            if (newToken && window.storage?.setToken) {
                                window.storage.setToken(newToken);
                                console.log('POA Review - Token refreshed successfully');
                                return newToken;
                            }
                        }
                        console.warn('POA Review - Token refresh failed');
                        return null;
                    } catch (error) {
                        console.error('POA Review - Token refresh error:', error);
                        return null;
                    }
                };
                
                while (retries <= maxRetries) {
                    try {
                        let token = getAuthToken();
                        
                        batchResponse = await fetch('/api/poa-review/process-batch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify({
                                batchId,
                                batchNumber,
                                totalBatches,
                                rows: batch,
                                sources: sources && sources.length > 0 ? sources : [],
                                fileName,
                                isFinal
                            })
                        });
                        
                        // Handle 401 Unauthorized - try to refresh token once
                        if (batchResponse.status === 401 && retries === 0) {
                            console.warn(`POA Review - Batch ${batchNumber} got 401, attempting token refresh...`);
                            const newToken = await refreshToken();
                            if (newToken) {
                                // Retry immediately with new token (don't count as retry)
                                token = newToken;
                                batchResponse = await fetch('/api/poa-review/process-batch', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${token}`
                                    },
                                    body: JSON.stringify({
                                        batchId,
                                        batchNumber,
                                        totalBatches,
                                        rows: batch,
                                        sources: sources && sources.length > 0 ? sources : [],
                                        fileName,
                                        isFinal
                                    })
                                });
                            }
                        }
                        
                        // If successful or client error (4xx except 401), don't retry
                        if (batchResponse.ok || (batchResponse.status >= 400 && batchResponse.status < 500 && batchResponse.status !== 401)) {
                            break;
                        }
                        
                        // Retry on server/gateway errors (5xx) or 401 after refresh failed
                        if ((batchResponse.status >= 500 || batchResponse.status === 401) && retries < maxRetries) {
                            retries++;
                            console.warn(`POA Review - Batch ${batchNumber} got ${batchResponse.status}, retrying (${retries}/${maxRetries})...`);
                            await new Promise(resolve => setTimeout(resolve, retryDelay * retries));
                            continue;
                        }
                        
                        break;
                    } catch (fetchError) {
                        if (retries < maxRetries) {
                            retries++;
                            console.warn(`POA Review - Batch ${batchNumber} fetch error, retrying (${retries}/${maxRetries}):`, fetchError.message);
                            await new Promise(resolve => setTimeout(resolve, retryDelay * retries));
                            continue;
                        }
                        throw fetchError;
                    }
                }
                
                console.log(`POA Review - Batch ${batchNumber}/${totalBatches} response received, status:`, batchResponse.status);

                if (!batchResponse.ok) {
                    // Get detailed error information
                    let errorMessage = `Failed to process batch ${batchNumber}`;
                    try {
                        const errorData = await batchResponse.json();
                        console.error('POA Review Batch API Error:', errorData);
                        errorMessage = errorData.error?.message || 
                                      errorData.message || 
                                      errorData.error || 
                                      errorMessage;
                        // Include more details if available
                        if (errorData.error?.details) {
                            errorMessage += `: ${errorData.error.details}`;
                        }
                    } catch (parseError) {
                        const errorText = await batchResponse.text().catch(() => batchResponse.statusText);
                        console.error('POA Review Batch API Error (text):', errorText);
                        errorMessage = `${errorMessage}: ${errorText || batchResponse.statusText}`;
                    }
                    throw new Error(errorMessage);
                }

                const batchResult = await batchResponse.json();
                console.log(`POA Review - Batch ${batchNumber} result:`, batchResult);

                if (isFinal) {
                    console.log('POA Review - Final batch received, checking for download URL...');
                    if (batchResult.data?.downloadUrl || batchResult.downloadUrl) {
                        // Final batch - processing complete
                        const downloadUrl = batchResult.data?.downloadUrl || batchResult.downloadUrl;
                        console.log('POA Review - Download URL received:', downloadUrl);
                        
                        setProcessingProgress('Generating final report...');
                        setProcessingProgressPercent(90);

                        // Wait a moment for server to finish processing
                        await new Promise(resolve => setTimeout(resolve, 2000));

                        // Check for final result
                        setDownloadUrl(downloadUrl);
                        setProcessingProgress('Complete!');
                        setProcessingProgressPercent(100);
                        console.log('POA Review - Processing complete, download URL set');
                        return;
                    } else {
                        console.warn('POA Review - Final batch received but no download URL:', batchResult);
                        throw new Error('Final batch processed but no download URL received. Server may still be processing.');
                    }
                } else {
                    // Update progress for non-final batches
                    const progress = batchResult.data?.progress || batchResult.progress || Math.round((batchNumber / totalBatches) * 50);
                    setProcessingProgressPercent(progress);
                    console.log(`POA Review - Batch ${batchNumber} acknowledged, progress: ${progress}%`);
                }
            }
        } catch (error) {
            console.error('POA Review - Chunked processing error:', error);
            throw error;
        }
    }, [sources]);

    const toggleDocumentSource = useCallback((sourceName) => {
        setSources(prev => prev.includes(sourceName) ? prev.filter(s => s !== sourceName) : [...prev, sourceName]);
    }, []);
    const selectAllDocumentSources = useCallback(() => {
        setSources(prev => {
            const combined = new Set([...prev, ...documentSources]);
            return Array.from(combined);
        });
    }, [documentSources]);
    const clearDocumentSourceSelection = useCallback(() => {
        setSources(prev => prev.filter(s => !documentSources.includes(s)));
    }, [documentSources]);

    // Main upload handler
    const handleUpload = useCallback(async () => {
        if (!uploadedFile) {
            setError('Please select a file first');
            return;
        }
        if (!sources || sources.length === 0) {
            setError('Select at least one SMR source to include (from the list above or add one manually).');
            return;
        }

        setIsProcessing(true);
        setError(null);
        setProcessingProgressPercent(0);

        try {
            const fileName = uploadedFile.name.toLowerCase();
            const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
            const isLargeFile = uploadedFile.size > 10 * 1024 * 1024; // 10MB threshold
            
            // For large Excel files, use server-side processing (much faster)
            if (isExcel && isLargeFile) {
                console.log('POA Review - Large Excel file detected, using server-side processing...');
                setProcessingProgress('Uploading file to server for processing...');

                let formData = new FormData();
                formData.append('file', uploadedFile);
                formData.append('sources', JSON.stringify(sources));

                const token = window.storage?.getToken?.() || '';
                const maxRetries = 2;
                const retryDelay = 2000;
                let response = null;

                for (let attempt = 0; attempt <= maxRetries; attempt++) {
                    try {
                        if (attempt > 0) {
                            setProcessingProgress(`Retrying upload (${attempt}/${maxRetries})...`);
                            await new Promise(r => setTimeout(r, retryDelay * attempt));
                            // FormData body is consumed after first fetch; recreate for retry
                            const retryFormData = new FormData();
                            retryFormData.append('file', uploadedFile);
                            retryFormData.append('sources', JSON.stringify(sources));
                            formData = retryFormData;
                        }
                        response = await fetch('/api/poa-review/process-excel', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${token}`
                            },
                            body: formData
                        });
                        break;
                    } catch (fetchErr) {
                        const isNetworkError = fetchErr?.message === 'Failed to fetch' ||
                            (fetchErr?.name && /NetworkError|TypeError/i.test(fetchErr.name));
                        if (attempt < maxRetries && isNetworkError) {
                            console.warn(`POA Review - process-excel network error, retrying (${attempt + 1}/${maxRetries}):`, fetchErr.message);
                            continue;
                        }
                        const friendlyMsg = isNetworkError
                            ? 'Network request was interrupted (e.g. tab in background or connection lost). Please keep this tab active and try again.'
                            : (fetchErr?.message || 'Upload failed');
                        throw new Error(friendlyMsg);
                    }
                }

                if (!response?.ok) {
                    const errorData = await response.json().catch(() => ({ message: response?.statusText || 'Unknown error' }));
                    const msg = (typeof errorData.error === 'object' && errorData.error?.message)
                        ? errorData.error.message
                        : (typeof errorData.error === 'string' ? errorData.error : null)
                        || errorData.message
                        || (typeof errorData.errorDetails === 'object' && errorData.errorDetails?.message)
                        || (typeof errorData.errorDetails === 'string' ? errorData.errorDetails : null)
                        || 'Failed to process file';
                    console.error('POA Review process-excel API error:', errorData);
                    throw new Error(msg);
                }

                const result = await response.json();
                const downloadUrl = result.data?.downloadUrl || result.downloadUrl;

                if (downloadUrl) {
                    setDownloadUrl(downloadUrl);
                    setProcessingProgress('Complete!');
                    setProcessingProgressPercent(100);
                } else {
                    throw new Error('No download URL received from server');
                }
                return;
            }
            
            // For smaller files or CSV, use client-side parsing
            setProcessingProgress('Reading file...');
            const rows = await parseFileToRows(uploadedFile);
            
            console.log('POA Review - File parsed, rows:', rows.length);
            
            if (rows.length === 0) {
                throw new Error('No data rows found in file');
            }

            if (rows.length > MAX_ROWS) {
                throw new Error(
                    `This file has too many rows (${rows.length.toLocaleString()}). Maximum ${MAX_ROWS.toLocaleString()} rows are supported to avoid server overload. Please split your file or use a smaller dataset.`
                );
            }

            const largeFileNote = rows.length > 50000
                ? ' Large file — processing may take several minutes; do not close this page.'
                : '';
            setProcessingProgress(`Parsed ${rows.length} rows. Starting batch processing...${largeFileNote}`);
            await handleChunkedUpload(rows, uploadedFile.name);
        } catch (err) {
            console.error('POA Review error:', err);
            setError(err.message || 'An error occurred while processing the file');
            setProcessingProgress('');
            setProcessingProgressPercent(0);
        } finally {
            setIsProcessing(false);
        }
    }, [uploadedFile, sources, parseFileToRows, handleChunkedUpload]);

    const handleDownload = useCallback(() => {
        if (downloadUrl) {
            window.open(downloadUrl, '_blank');
        }
    }, [downloadUrl]);

    const handleAddSource = useCallback(() => {
        if (newSource.trim() && !sources.includes(newSource.trim())) {
            setSources([...sources, newSource.trim()]);
            setNewSource('');
        }
    }, [newSource, sources]);

    const handleRemoveSource = useCallback((sourceToRemove) => {
        setSources(sources.filter(s => s !== sourceToRemove));
    }, [sources]);

    return (
        <div className="space-y-4">
            {/* Header */}
            <div>
                <h3 className={`text-sm font-semibold mb-2 ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                    Proof of Activity (POA) Review
                </h3>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                    Upload fuel transaction data to generate compliance reports with proof of activity analysis
                </p>
            </div>

            {/* File Upload Section */}
            <div className={`rounded-lg border p-4 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-200' : 'text-gray-700'}`}>
                    Upload Transaction Data File
                </label>
                <div className="flex flex-col sm:flex-row gap-3">
                    <label className="flex-1 cursor-pointer">
                        <input
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            onChange={handleFileSelect}
                            disabled={isProcessing}
                            className="hidden"
                        />
                        <div className={`border-2 border-dashed rounded-lg p-4 text-center transition ${
                            isDark 
                                ? 'border-slate-600 bg-slate-700 hover:border-slate-500' 
                                : 'border-gray-300 bg-gray-50 hover:border-gray-400'
                        } ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                            {uploadedFile ? (
                                <div>
                                    <i className={`fas fa-file-excel text-2xl mb-2 ${isDark ? 'text-green-400' : 'text-green-600'}`}></i>
                                    <p className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-gray-900'}`}>
                                        {uploadedFile.name}
                                    </p>
                                    <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                                        {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                                    </p>
                                </div>
                            ) : (
                                <div>
                                    <i className={`fas fa-cloud-upload-alt text-3xl mb-2 ${isDark ? 'text-slate-400' : 'text-gray-400'}`}></i>
                                    <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
                                        Click to select file
                                    </p>
                                    <p className={`text-xs mt-1 ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>
                                        Excel (.xlsx, .xls) or CSV files up to 50MB
                                    </p>
                                </div>
                            )}
                        </div>
                    </label>
                    {uploadedFile && !isProcessing && (
                        <button
                            onClick={() => {
                                setUploadedFile(null);
                                setDownloadUrl(null);
                                setError(null);
                                setDocumentSources([]);
                                setSources([]);
                            }}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                                isDark 
                                    ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' 
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            <i className="fas fa-times mr-2"></i>
                            Clear
                        </button>
                    )}
                </div>
            </div>

            {/* Sources Configuration */}
            <div className={`rounded-lg border p-4 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-200' : 'text-gray-700'}`}>
                    SMR Sources to Include
                </label>
                <p className={`text-xs mb-3 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                    Upload a file first to see sources found in the document, then select which to include when calculating total SMR usage.
                </p>

                {sourcesDetecting && (
                    <p className={`text-sm mb-3 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                        <i className="fas fa-spinner fa-spin mr-2"></i>Detecting sources in document...
                    </p>
                )}

                {!sourcesDetecting && documentSources.length > 0 && (
                    <div className="mb-4">
                        <p className={`text-xs font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
                            Sources found in your document
                        </p>
                        <div className="flex gap-2 mb-2">
                            <button
                                type="button"
                                onClick={selectAllDocumentSources}
                                className={`text-xs px-2 py-1 rounded ${isDark ? 'bg-slate-600 text-slate-200 hover:bg-slate-500' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                            >
                                Select all
                            </button>
                            <button
                                type="button"
                                onClick={clearDocumentSourceSelection}
                                className={`text-xs px-2 py-1 rounded ${isDark ? 'bg-slate-600 text-slate-200 hover:bg-slate-500' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                            >
                                Clear selection
                            </button>
                        </div>
                        <div className={`max-h-32 overflow-y-auto rounded border p-2 space-y-1 ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-200'}`}>
                            {documentSources.map((name) => (
                                <label key={name} className={`flex items-center gap-2 cursor-pointer ${isDark ? 'text-slate-200' : 'text-gray-700'}`}>
                                    <input
                                        type="checkbox"
                                        checked={sources.includes(name)}
                                        onChange={() => toggleDocumentSource(name)}
                                        className="rounded border-gray-400"
                                    />
                                    <span className="text-sm">{name}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                )}

                <p className={`text-xs mb-2 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                    Or add a source name manually (if not in the list above):
                </p>
                <div className="flex flex-col sm:flex-row gap-2 mb-3">
                    <input
                        type="text"
                        value={newSource}
                        onChange={(e) => setNewSource(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddSource()}
                        placeholder="Enter source name from your document"
                        className={`flex-1 px-3 py-2 text-sm border rounded-lg ${
                            isDark 
                                ? 'bg-slate-700 border-slate-600 text-slate-100' 
                                : 'bg-white border-gray-300'
                        }`}
                    />
                    <button
                        onClick={handleAddSource}
                        disabled={!newSource.trim()}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                            newSource.trim()
                                ? isDark 
                                    ? 'bg-indigo-600 text-white hover:bg-indigo-700' 
                                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                : isDark
                                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        }`}
                    >
                        <i className="fas fa-plus mr-2"></i>
                        Add
                    </button>
                </div>

                {sources.length > 0 && (
                    <div className="space-y-2">
                        <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Selected sources (will be used for report):</p>
                        {sources.map((source, index) => (
                            <div
                                key={index}
                                className={`flex items-center justify-between p-2 rounded ${
                                    isDark ? 'bg-slate-700' : 'bg-gray-50'
                                }`}
                            >
                                <span className={`text-sm ${isDark ? 'text-slate-200' : 'text-gray-700'}`}>
                                    {source}
                                </span>
                                <button
                                    onClick={() => handleRemoveSource(source)}
                                    className={`p-1 rounded transition ${
                                        isDark 
                                            ? 'text-slate-400 hover:text-red-400 hover:bg-slate-600' 
                                            : 'text-gray-400 hover:text-red-600 hover:bg-gray-200'
                                    }`}
                                >
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Error Display */}
            {error && (
                <div className={`rounded-lg border p-3 ${isDark ? 'bg-red-900/30 border-red-700 text-red-200' : 'bg-red-50 border-red-200 text-red-800'}`}>
                    <div className="flex items-center gap-2">
                        <i className="fas fa-exclamation-circle"></i>
                        <span className="text-sm">{error}</span>
                    </div>
                </div>
            )}

            {/* Processing Status */}
            {isProcessing && (
                <div className={`rounded-lg border p-4 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                    <div className="flex items-center gap-3 mb-3">
                        <i className="fas fa-spinner fa-spin text-indigo-600"></i>
                        <div className="flex-1">
                            <p className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-gray-900'}`}>
                                Processing...
                            </p>
                            <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                                {processingProgress}
                            </p>
                        </div>
                        <span className={`text-xs font-medium ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                            {processingProgressPercent}%
                        </span>
                    </div>
                    {/* Progress Bar */}
                    <div className={`w-full h-2 rounded-full ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`}>
                        <div 
                            className="h-2 rounded-full bg-indigo-600 transition-all duration-300"
                            style={{ width: `${processingProgressPercent}%` }}
                        ></div>
                    </div>
                </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
                <button
                    onClick={handleUpload}
                    disabled={!uploadedFile || isProcessing || !sources || sources.length === 0}
                    title={uploadedFile && sources.length === 0 ? 'Select at least one SMR source above' : undefined}
                    className={`flex-1 px-4 py-3 rounded-lg text-sm font-medium transition ${
                        uploadedFile && !isProcessing && sources && sources.length > 0
                            ? isDark
                                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                : 'bg-indigo-600 text-white hover:bg-indigo-700'
                            : isDark
                                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                >
                    {isProcessing ? (
                        <>
                            <i className="fas fa-spinner fa-spin mr-2"></i>
                            Processing...
                        </>
                    ) : (
                        <>
                            <i className="fas fa-play mr-2"></i>
                            Process & Generate Report
                        </>
                    )}
                </button>

                {downloadUrl && (
                    <button
                        onClick={handleDownload}
                        className={`px-4 py-3 rounded-lg text-sm font-medium transition ${
                            isDark
                                ? 'bg-green-600 text-white hover:bg-green-700'
                                : 'bg-green-600 text-white hover:bg-green-700'
                        }`}
                    >
                        <i className="fas fa-download mr-2"></i>
                        Download Report
                    </button>
                )}
            </div>

            {/* Info Section */}
            <div className={`rounded-lg border p-4 ${isDark ? 'bg-blue-900/30 border-blue-700' : 'bg-blue-50 border-blue-200'}`}>
                <h4 className={`text-sm font-semibold mb-2 ${isDark ? 'text-blue-200' : 'text-blue-900'}`}>
                    <i className="fas fa-info-circle mr-2"></i>
                    About POA Review
                </h4>
                <ul className={`text-xs space-y-1 ${isDark ? 'text-blue-200' : 'text-blue-800'}`}>
                    <li>• Analyzes fuel transaction data and proof of activity records</li>
                    <li>• Identifies assets with missing proof records (non-compliant)</li>
                    <li>• Groups consecutive transactions within 1 hour</li>
                    <li>• Calculates time gaps between proof records and transactions</li>
                    <li>• Generates formatted Excel reports with conditional formatting</li>
                </ul>
            </div>
        </div>
    );
};

// Make available globally
window.POAReview = POAReview;

// Dispatch event to notify other components
try {
    window.dispatchEvent(new CustomEvent('componentLoaded', { 
        detail: { component: 'POAReview' } 
    }));
    console.log('✅ POAReview component registered and event dispatched');
} catch (error) {
    console.warn('⚠️ Failed to dispatch componentLoaded event:', error);
}

