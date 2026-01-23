// Use React from window
const { useState, useRef, useEffect } = React;

const DocumentParser = () => {
    const [documentFile, setDocumentFile] = useState(null);
    const [documentPreview, setDocumentPreview] = useState(null);
    const [parsing, setParsing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState(null);
    const [extractedData, setExtractedData] = useState(null);
    const [structuredTables, setStructuredTables] = useState([]);
    const [rawText, setRawText] = useState('');
    const [parsingMode, setParsingMode] = useState('comprehensive'); // 'comprehensive', 'basic', 'handwriting'
    const fileInputRef = useRef(null);

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Support images and PDFs
        const validTypes = ['image/', 'application/pdf'];
        if (!validTypes.some(type => file.type.startsWith(type))) {
            setError('Please select a valid image or PDF file');
            return;
        }

        setError(null);
        setDocumentFile(file);
        setExtractedData(null);
        setStructuredTables([]);
        setRawText('');
        setProgress(0);

        // Create preview for images
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                setDocumentPreview(e.target.result);
            };
            reader.readAsDataURL(file);
        } else {
            setDocumentPreview(null);
        }
    };

    const parseDocument = async () => {
        if (!documentFile) return;

        setParsing(true);
        setError(null);
        setProgress(0);

        try {
            // Convert file to data URL
            const reader = new FileReader();
            const dataUrl = await new Promise((resolve, reject) => {
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsDataURL(documentFile);
            });

            // Simulate progress
            const progressInterval = setInterval(() => {
                setProgress(prev => Math.min(prev + 2, 90));
            }, 200);

            // Call API endpoint
            const response = await fetch('/api/tools/document-parser', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    file: {
                        name: documentFile.name,
                        dataUrl: dataUrl,
                        type: documentFile.type
                    },
                    mode: parsingMode,
                    extractTables: true,
                    extractStructuredData: true
                })
            });

            clearInterval(progressInterval);
            setProgress(95);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }

            const result = await response.json();
            setProgress(100);

            // Process results
            if (result.success) {
                setRawText(result.extractedText || '');
                setExtractedData(result);
                
                // Process structured tables
                if (result.tables && result.tables.length > 0) {
                    setStructuredTables(result.tables);
                } else if (result.structuredData) {
                    // Convert structured data to tables
                    const tables = convertStructuredDataToTables(result.structuredData);
                    setStructuredTables(tables);
                }
            } else {
                throw new Error(result.error || 'Parsing failed');
            }

        } catch (err) {
            console.error('Error parsing document:', err);
            setError('Failed to parse document: ' + err.message);
        } finally {
            setParsing(false);
            setTimeout(() => setProgress(0), 1000);
        }
    };

    const convertStructuredDataToTables = (structuredData) => {
        const tables = [];
        
        if (typeof structuredData === 'object' && structuredData !== null) {
            // If it's an array of objects, create a table
            if (Array.isArray(structuredData)) {
                if (structuredData.length > 0 && typeof structuredData[0] === 'object') {
                    const headers = Object.keys(structuredData[0]);
                    const rows = structuredData.map(item => 
                        headers.map(header => item[header] || '')
                    );
                    tables.push({
                        title: 'Extracted Data',
                        headers: headers,
                        rows: rows
                    });
                }
            } else {
                // Convert object to key-value table
                const rows = Object.entries(structuredData).map(([key, value]) => [
                    key,
                    typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
                ]);
                tables.push({
                    title: 'Document Information',
                    headers: ['Field', 'Value'],
                    rows: rows
                });
            }
        }
        
        return tables;
    };

    const downloadAsCSV = (table, index) => {
        if (!table || !table.rows) return;

        const csvContent = [
            table.headers.join(','),
            ...table.rows.map(row => 
                row.map(cell => {
                    const cellStr = String(cell || '');
                    // Escape quotes and wrap in quotes if contains comma or newline
                    if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
                        return `"${cellStr.replace(/"/g, '""')}"`;
                    }
                    return cellStr;
                }).join(',')
            )
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${table.title || 'table'}-${index + 1}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const downloadAsJSON = () => {
        if (!extractedData) return;

        const jsonData = {
            fileName: documentFile.name,
            extractedText: rawText,
            structuredData: extractedData.structuredData,
            tables: structuredTables,
            metadata: extractedData.metadata,
            timestamp: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = documentFile.name.replace(/\.[^.]+$/, '-parsed.json');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const downloadAsTxt = () => {
        if (!rawText) return;

        const blob = new Blob([rawText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = documentFile.name.replace(/\.[^.]+$/, '-extracted.txt');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        alert('Copied to clipboard!');
    };

    const reset = () => {
        setDocumentFile(null);
        setDocumentPreview(null);
        setExtractedData(null);
        setStructuredTables([]);
        setRawText('');
        setProgress(0);
        setError(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div className="space-y-3">
            {/* Upload Section */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Upload Document</h3>
                
                <div className="space-y-3">
                    {/* Parsing Mode Selection */}
                    <div className="mb-3">
                        <label className="text-xs font-medium text-gray-700 mb-1.5 block">Parsing Mode</label>
                        <div className="flex space-x-2">
                            <button
                                onClick={() => setParsingMode('comprehensive')}
                                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                                    parsingMode === 'comprehensive'
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                            >
                                <i className="fas fa-brain mr-1"></i>
                                Comprehensive
                            </button>
                            <button
                                onClick={() => setParsingMode('handwriting')}
                                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                                    parsingMode === 'handwriting'
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                            >
                                <i className="fas fa-pen-fancy mr-1"></i>
                                Handwriting
                            </button>
                            <button
                                onClick={() => setParsingMode('basic')}
                                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                                    parsingMode === 'basic'
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                            >
                                <i className="fas fa-file-alt mr-1"></i>
                                Basic OCR
                            </button>
                        </div>
                        <p className="text-[10px] text-gray-500 mt-1">
                            {parsingMode === 'comprehensive' && 'Uses advanced AI to extract everything including handwriting, tables, and structured data'}
                            {parsingMode === 'handwriting' && 'Optimized for handwritten text recognition'}
                            {parsingMode === 'basic' && 'Fast OCR for printed text and documents'}
                        </p>
                    </div>

                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-primary-400 hover:bg-primary-50 transition-colors"
                    >
                        <i className="fas fa-file-upload text-3xl text-gray-400 mb-2"></i>
                        <p className="text-xs text-gray-600 mb-1">
                            Click to select document or drag and drop
                        </p>
                        <p className="text-[10px] text-gray-500">
                            Supports: JPG, PNG, PDF, BMP, GIF • Maximum size: 50MB
                        </p>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*,.pdf"
                            onChange={handleFileSelect}
                            className="hidden"
                        />
                    </div>

                    {documentFile && (
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center space-x-2">
                                    <i className={`fas ${documentFile.type.startsWith('image/') ? 'fa-file-image' : 'fa-file-pdf'} text-blue-600 text-lg`}></i>
                                    <div>
                                        <p className="text-xs font-medium text-gray-900">{documentFile.name}</p>
                                        <p className="text-[10px] text-gray-600">
                                            {(documentFile.size / 1024).toFixed(2)} KB • {documentFile.type}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={reset}
                                    className="text-gray-400 hover:text-red-600 transition-colors"
                                >
                                    <i className="fas fa-times text-xs"></i>
                                </button>
                            </div>
                            
                            {documentPreview && (
                                <div className="mt-2 rounded border border-gray-300 overflow-hidden">
                                    <img 
                                        src={documentPreview} 
                                        alt="Preview" 
                                        className="w-full h-48 object-contain bg-gray-100"
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 flex items-start">
                            <i className="fas fa-exclamation-circle text-red-600 text-xs mt-0.5 mr-2"></i>
                            <p className="text-xs text-red-800">{error}</p>
                        </div>
                    )}

                    {documentFile && !extractedData && !parsing && (
                        <button
                            onClick={parseDocument}
                            className="w-full bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-xs font-medium transition-colors"
                        >
                            <i className="fas fa-magic mr-1.5"></i>
                            Parse Document
                        </button>
                    )}

                    {parsing && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-600">Parsing document...</span>
                                <span className="font-medium text-primary-600">{progress}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                <div
                                    className="bg-primary-600 h-full transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                ></div>
                            </div>
                            <p className="text-[10px] text-gray-500 text-center">
                                This may take a few moments depending on document complexity...
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Extracted Text Section */}
            {rawText && (
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-gray-900">Extracted Text</h3>
                        <div className="flex items-center space-x-2">
                            <button
                                onClick={() => copyToClipboard(rawText)}
                                className="text-xs text-gray-600 hover:text-gray-900 px-2 py-1 hover:bg-gray-100 rounded transition-colors"
                                title="Copy to clipboard"
                            >
                                <i className="fas fa-copy mr-1"></i>
                                Copy
                            </button>
                            <button
                                onClick={downloadAsTxt}
                                className="text-xs text-gray-600 hover:text-gray-900 px-2 py-1 hover:bg-gray-100 rounded transition-colors"
                                title="Download as text file"
                            >
                                <i className="fas fa-file-alt mr-1"></i>
                                TXT
                            </button>
                        </div>
                    </div>

                    <div className="bg-gray-50 rounded border border-gray-200 p-3 max-h-64 overflow-y-auto">
                        <pre className="text-xs text-gray-800 font-mono whitespace-pre-wrap">{rawText}</pre>
                    </div>

                    <div className="mt-2 text-[10px] text-gray-500 flex items-center justify-between">
                        <span>{rawText.length.toLocaleString()} characters</span>
                        <span>{rawText.split(/\s+/).filter(w => w.length > 0).length.toLocaleString()} words</span>
                    </div>
                </div>
            )}

            {/* Structured Tables Section */}
            {structuredTables.length > 0 && (
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-gray-900">Structured Data Tables</h3>
                        <button
                            onClick={downloadAsJSON}
                            className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded transition-colors font-medium"
                            title="Download all data as JSON"
                        >
                            <i className="fas fa-file-code mr-1"></i>
                            Download JSON
                        </button>
                    </div>

                    <div className="space-y-4">
                        {structuredTables.map((table, index) => (
                            <div key={index} className="border border-gray-200 rounded-lg overflow-hidden">
                                <div className="bg-gray-50 px-3 py-2 flex items-center justify-between border-b border-gray-200">
                                    <h4 className="text-xs font-semibold text-gray-900">{table.title || `Table ${index + 1}`}</h4>
                                    <button
                                        onClick={() => downloadAsCSV(table, index)}
                                        className="text-[10px] text-gray-600 hover:text-gray-900 px-2 py-1 hover:bg-gray-100 rounded transition-colors"
                                        title="Download as CSV"
                                    >
                                        <i className="fas fa-download mr-1"></i>
                                        CSV
                                    </button>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="bg-gray-100">
                                                {table.headers.map((header, hIndex) => (
                                                    <th key={hIndex} className="px-3 py-2 text-left font-semibold text-gray-700 border-b border-gray-200">
                                                        {header}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {table.rows.map((row, rIndex) => (
                                                <tr key={rIndex} className={rIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                                    {row.map((cell, cIndex) => (
                                                        <td key={cIndex} className="px-3 py-2 text-gray-800 border-b border-gray-100">
                                                            {String(cell || '')}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Metadata Section */}
            {extractedData?.metadata && (
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Document Metadata</h3>
                    <div className="bg-gray-50 rounded border border-gray-200 p-3">
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            {Object.entries(extractedData.metadata).map(([key, value]) => (
                                <div key={key}>
                                    <span className="font-medium text-gray-700">{key}:</span>
                                    <span className="ml-2 text-gray-600">{String(value)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Tips Section */}
            {!documentFile && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="flex items-start">
                        <i className="fas fa-info-circle text-blue-600 text-xs mt-0.5 mr-2"></i>
                        <div>
                            <p className="text-xs font-medium text-blue-900 mb-1">Document Parser Features</p>
                            <ul className="text-xs text-blue-800 space-y-0.5 list-disc list-inside">
                                <li>Extracts all text including handwritten content</li>
                                <li>Automatically detects and structures tables</li>
                                <li>Identifies key-value pairs and structured data</li>
                                <li>Supports images (JPG, PNG, BMP, GIF) and PDFs</li>
                                <li>Uses advanced AI for handwriting recognition</li>
                                <li>Exports data as CSV, JSON, or TXT</li>
                            </ul>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Make available globally
window.DocumentParser = DocumentParser;
