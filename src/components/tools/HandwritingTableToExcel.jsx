// Use React from window
const { useState, useRef } = React;

const HandwritingTableToExcel = () => {
    const [documentFile, setDocumentFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState(null);
    const [warnings, setWarnings] = useState([]);
    const [result, setResult] = useState(null);
    const fileInputRef = useRef(null);

    const handleFileSelect = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const isValid = file.type.startsWith('image/') || file.type === 'application/pdf';
        if (!isValid) {
            setError('Please select an image or PDF file.');
            return;
        }

        setError(null);
        setWarnings([]);
        setResult(null);
        setDocumentFile(file);
        setProgress(0);

        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => setPreviewUrl(e.target.result);
            reader.readAsDataURL(file);
        } else {
            setPreviewUrl(null);
        }
    };

    const processDocument = async () => {
        if (!documentFile) return;
        setIsProcessing(true);
        setError(null);
        setWarnings([]);
        setProgress(0);

        const progressTimer = setInterval(() => {
            setProgress((prev) => Math.min(prev + 3, 92));
        }, 250);

        try {
            const reader = new FileReader();
            const dataUrl = await new Promise((resolve, reject) => {
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsDataURL(documentFile);
            });

            const response = await fetch('/api/tools/handwriting-table-excel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file: {
                        name: documentFile.name,
                        type: documentFile.type,
                        dataUrl
                    }
                })
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                const message = payload?.error?.message || payload?.error || `Server error ${response.status}`;
                throw new Error(message);
            }

            setResult(payload.data || payload);
            setWarnings((payload?.data?.warnings || payload?.warnings || []).filter(Boolean));
            setProgress(100);
        } catch (e) {
            setError(`Processing failed: ${e.message}`);
        } finally {
            clearInterval(progressTimer);
            setIsProcessing(false);
            setTimeout(() => setProgress(0), 1200);
        }
    };

    const downloadWorkbook = () => {
        const workbook = result?.workbook;
        if (!workbook?.base64) return;
        const byteChars = atob(workbook.base64);
        const byteNums = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
        const blob = new Blob([new Uint8Array(byteNums)], { type: workbook.mimeType || 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = workbook.fileName || 'handwriting-tables.xlsx';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const resetAll = () => {
        setDocumentFile(null);
        setPreviewUrl(null);
        setResult(null);
        setWarnings([]);
        setError(null);
        setProgress(0);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div className="space-y-3">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Upload Handwritten Table Document</h3>

                <div className="space-y-3">
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-primary-400 hover:bg-primary-50 transition-colors"
                    >
                        <i className="fas fa-table text-3xl text-gray-400 mb-2"></i>
                        <p className="text-xs text-gray-600 mb-1">Click to select document</p>
                        <p className="text-[10px] text-gray-500">Supports: JPG, PNG, PDF • Max 25MB</p>
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
                                            {(documentFile.size / 1024).toFixed(2)} KB
                                        </p>
                                    </div>
                                </div>
                                <button onClick={resetAll} className="text-gray-400 hover:text-red-600 transition-colors">
                                    <i className="fas fa-times text-xs"></i>
                                </button>
                            </div>
                            {previewUrl && (
                                <div className="mt-2 rounded border border-gray-300 overflow-hidden">
                                    <img src={previewUrl} alt="Preview" className="w-full h-48 object-contain bg-gray-100" />
                                </div>
                            )}
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-800">{error}</div>
                    )}

                    {warnings.length > 0 && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2.5">
                            {warnings.map((w, idx) => (
                                <p key={idx} className="text-xs text-yellow-800">{w}</p>
                            ))}
                        </div>
                    )}

                    {documentFile && !isProcessing && !result && (
                        <button
                            onClick={processDocument}
                            className="w-full bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-xs font-medium transition-colors"
                        >
                            <i className="fas fa-file-excel mr-1.5"></i>
                            Extract Tables to Excel
                        </button>
                    )}

                    {isProcessing && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-600">Extracting handwritten tables...</span>
                                <span className="font-medium text-primary-600">{progress}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                <div className="bg-primary-600 h-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {result && (
                <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-900">Extraction Results</h3>
                        <button
                            onClick={downloadWorkbook}
                            className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded transition-colors font-medium"
                        >
                            <i className="fas fa-download mr-1"></i>
                            Download XLSX
                        </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                        <div className="bg-gray-50 border border-gray-200 rounded p-2">
                            <p className="text-gray-500">Method</p>
                            <p className="font-semibold text-gray-900">{result.method || 'unknown'}</p>
                        </div>
                        <div className="bg-gray-50 border border-gray-200 rounded p-2">
                            <p className="text-gray-500">Tables</p>
                            <p className="font-semibold text-gray-900">{(result.tables || []).length}</p>
                        </div>
                        <div className="bg-gray-50 border border-gray-200 rounded p-2">
                            <p className="text-gray-500">Rows Needing Review</p>
                            <p className="font-semibold text-gray-900">{(result.reviewRows || []).length}</p>
                        </div>
                    </div>

                    {(result.tables || []).slice(0, 2).map((table, idx) => (
                        <div key={table.id || idx} className="border border-gray-200 rounded-lg overflow-hidden">
                            <div className="bg-gray-50 px-3 py-2 border-b border-gray-200 flex items-center justify-between">
                                <h4 className="text-xs font-semibold text-gray-900">{table.title || `Table ${idx + 1}`}</h4>
                                <span className="text-[10px] text-gray-500">Confidence: {Math.round((table.confidence || 0) * 100)}%</span>
                            </div>
                            <div className="overflow-x-auto max-h-56">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="bg-gray-100">
                                            {(table.headers || []).map((header, h) => (
                                                <th key={h} className="px-3 py-2 text-left font-semibold text-gray-700 border-b border-gray-200">{header}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(table.rows || []).slice(0, 8).map((row, r) => (
                                            <tr key={r} className={r % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                                {row.map((cell, c) => (
                                                    <td key={c} className="px-3 py-2 text-gray-800 border-b border-gray-100">{String(cell || '')}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

window.HandwritingTableToExcel = HandwritingTableToExcel;
