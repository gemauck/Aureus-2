// Use React from window
const { useState, useRef } = React;

const PDFToWordConverter = () => {
    const [pdfFile, setPdfFile] = useState(null);
    const [extractedText, setExtractedText] = useState('');
    const [pdfInfo, setPdfInfo] = useState(null);
    const [converting, setConverting] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState(null);
    const fileInputRef = useRef(null);

    const handleFileSelect = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.type !== 'application/pdf') {
            setError('Please select a valid PDF file');
            return;
        }

        setError(null);
        setPdfFile(file);
        setPdfInfo({
            name: file.name,
            size: (file.size / 1024).toFixed(2) + ' KB',
            type: file.type
        });
        setExtractedText('');
        setProgress(0);
    };

    const extractTextFromPDF = async () => {
        if (!pdfFile) return;

        setConverting(true);
        setError(null);
        setProgress(10);

        try {
            // Read file as ArrayBuffer
            const arrayBuffer = await pdfFile.arrayBuffer();
            setProgress(20);

            // Load PDF using pdf.js
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            setProgress(40);

            let fullText = '';
            const numPages = pdf.numPages;
            
            // Extract text from each page
            for (let pageNum = 1; pageNum <= numPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                
                const pageText = textContent.items
                    .map(item => item.str)
                    .join(' ');
                
                fullText += `\n\n--- Page ${pageNum} ---\n\n${pageText}`;
                
                setProgress(40 + (pageNum / numPages) * 50);
            }

            setExtractedText(fullText.trim());
            setProgress(100);
            
            // Update PDF info
            setPdfInfo(prev => ({
                ...prev,
                pages: numPages
            }));

        } catch (err) {
            console.error('Error extracting PDF:', err);
            setError('Failed to extract text from PDF: ' + err.message);
        } finally {
            setConverting(false);
        }
    };

    const downloadAsWord = () => {
        if (!extractedText) return;

        // Create enhanced RTF document with better formatting
        let rtfContent = '{\\rtf1\\ansi\\ansicpg1252\\deff0\\nouicompat\\deflang1033\n';
        
        // Font table with multiple fonts
        rtfContent += '{\\fonttbl{\\f0\\fnil\\fcharset0 Calibri;}{\\f1\\fmodern\\fcharset0 Courier New;}}\n';
        
        // Color table
        rtfContent += '{\\colortbl ;\\red0\\green0\\blue0;\\red0\\green0\\blue255;\\red255\\green0\\blue0;}\n';
        
        // Document formatting
        rtfContent += '\\viewkind4\\uc1\n';
        rtfContent += '\\pard\\sl276\\slmult1\\f0\\fs22\\lang9 ';
        
        // Process text with better formatting
        const lines = extractedText.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (line === '') {
                // Empty line - add paragraph break
                rtfContent += '\\par\\par\n';
                continue;
            }
            
            // Check if line looks like a heading (all caps, short, or ends with colon)
            const isHeading = (
                (line === line.toUpperCase() && line.length < 50 && line.length > 3) ||
                (line.match(/^(\\d+\\.\\s|[A-Z][A-Z\\s]{2,}:)/) && line.length < 60)
            );
            
            // Check if line looks like a page marker
            const isPageMarker = line.match(/^-+\s*Page\s+\\d+\s*-+$/i);
            
            if (isPageMarker) {
                // Page markers - centered and bold
                rtfContent += '\\pard\\qc\\b ';
                rtfContent += escapeRtf(line);
                rtfContent += '\\b0\\par\\par\n';
                rtfContent += '\\pard\\sl276\\slmult1 ';
            } else if (isHeading) {
                // Headings - bold and slightly larger
                rtfContent += '\\pard\\sl276\\slmult1\\b\\fs24 ';
                rtfContent += escapeRtf(line);
                rtfContent += '\\b0\\fs22\\par\n';
            } else {
                // Regular paragraph with preserved spacing
                const leadingSpaces = lines[i].match(/^\\s*/)[0].length;
                
                // Add indentation if line starts with spaces (preserve structure)
                if (leadingSpaces > 0) {
                    const indent = Math.min(leadingSpaces * 72, 1440); // Max 2 inches
                    rtfContent += `\\pard\\sl276\\slmult1\\li${indent} `;
                } else {
                    rtfContent += '\\pard\\sl276\\slmult1 ';
                }
                
                rtfContent += escapeRtf(line);
                rtfContent += '\\par\n';
            }
        }
        
        rtfContent += '}';

        // Create blob and download
        const blob = new Blob([rtfContent], { 
            type: 'application/rtf' 
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = pdfFile.name.replace('.pdf', '.rtf');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // Helper function to escape RTF special characters
    const escapeRtf = (text) => {
        return text
            .replace(/\\/g, '\\\\')
            .replace(/{/g, '\\{')
            .replace(/}/g, '\\}')
            .replace(/\t/g, '\\tab ');
    };

    const downloadAsTxt = () => {
        if (!extractedText) return;

        const blob = new Blob([extractedText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = pdfFile.name.replace('.pdf', '.txt');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const copyToClipboard = () => {
        if (!extractedText) return;
        navigator.clipboard.writeText(extractedText);
        alert('Text copied to clipboard!');
    };

    const reset = () => {
        setPdfFile(null);
        setExtractedText('');
        setPdfInfo(null);
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
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Upload PDF Document</h3>
                
                <div className="space-y-3">
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-primary-400 hover:bg-primary-50 transition-colors"
                    >
                        <i className="fas fa-cloud-upload-alt text-3xl text-gray-400 mb-2"></i>
                        <p className="text-xs text-gray-600 mb-1">
                            Click to select PDF file or drag and drop
                        </p>
                        <p className="text-[10px] text-gray-500">Maximum file size: 10MB</p>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf"
                            onChange={handleFileSelect}
                            className="hidden"
                        />
                    </div>

                    {pdfInfo && (
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                    <i className="fas fa-file-pdf text-red-600 text-lg"></i>
                                    <div>
                                        <p className="text-xs font-medium text-gray-900">{pdfInfo.name}</p>
                                        <p className="text-[10px] text-gray-600">
                                            {pdfInfo.size}
                                            {pdfInfo.pages && ` • ${pdfInfo.pages} pages`}
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
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 flex items-start">
                            <i className="fas fa-exclamation-circle text-red-600 text-xs mt-0.5 mr-2"></i>
                            <p className="text-xs text-red-800">{error}</p>
                        </div>
                    )}

                    {pdfFile && !extractedText && !converting && (
                        <button
                            onClick={extractTextFromPDF}
                            className="w-full bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-xs font-medium transition-colors"
                        >
                            <i className="fas fa-play mr-1.5"></i>
                            Extract Text from PDF
                        </button>
                    )}

                    {converting && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-600">Converting...</span>
                                <span className="font-medium text-primary-600">{progress}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                <div
                                    className="bg-primary-600 h-full transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                ></div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Preview Section */}
            {extractedText && (
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-gray-900">Extracted Text</h3>
                        <div className="flex items-center space-x-2">
                            <button
                                onClick={copyToClipboard}
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
                            <button
                                onClick={downloadAsWord}
                                className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded transition-colors font-medium"
                                title="Download as RTF (opens in Word)"
                            >
                                <i className="fas fa-file-word mr-1"></i>
                                Download RTF
                            </button>
                        </div>
                    </div>

                    <div className="bg-gray-50 rounded border border-gray-200 p-3 max-h-96 overflow-y-auto">
                        <pre className="text-xs text-gray-800 whitespace-pre-wrap font-mono leading-relaxed">
                            {extractedText}
                        </pre>
                    </div>

                    <div className="mt-2 text-[10px] text-gray-500 flex items-center justify-between">
                        <span>{extractedText.length.toLocaleString()} characters extracted</span>
                        <span>{extractedText.split(/\s+/).length.toLocaleString()} words</span>
                    </div>
                </div>
            )}

            {/* Instructions */}
            {!pdfFile && (
                <>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <div className="flex items-start">
                            <i className="fas fa-info-circle text-blue-600 text-xs mt-0.5 mr-2"></i>
                            <div>
                                <p className="text-xs font-medium text-blue-900 mb-1">How to use</p>
                                <ul className="text-xs text-blue-800 space-y-0.5 list-disc list-inside">
                                    <li>Upload a PDF file using the upload area above</li>
                                    <li>Click "Extract Text" to convert the PDF to text</li>
                                    <li>Review the extracted text in the preview</li>
                                    <li>Download as RTF format (opens in Microsoft Word)</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                    
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                        <div className="flex items-start">
                            <i className="fas fa-check-circle text-green-600 text-xs mt-0.5 mr-2"></i>
                            <div>
                                <p className="text-xs font-medium text-green-900 mb-1">Enhanced Formatting</p>
                                <p className="text-xs text-green-800">
                                    The RTF file preserves document structure with automatic heading detection, 
                                    indentation, and spacing. Opens perfectly in Microsoft Word, LibreOffice, and Google Docs.
                                </p>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

// Make available globally
window.PDFToWordConverter = PDFToWordConverter;
