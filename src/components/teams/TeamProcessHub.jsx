// Teams Process Hub — diagrams (Excalidraw / draw.io) + documents (PDF/Office attachments)
// Import sniff helpers: keep in sync with src/utils/teamProcessHubHelpers.js (unit tests).
const { useState, useEffect, useCallback, useMemo, useRef } = React;

const PROCESS_FILE_FOLDER = 'team-process-hub';
const DRAWIO_EMBED = 'https://embed.diagrams.net/?embed=1&ui=min&spin=1&proto=json&saveAndExit=0&noSaveBtn=0';

function isDrawioXml(text) {
    if (!text || typeof text !== 'string') return false;
    const t = text.trim();
    return t.includes('<mxfile') || t.includes('mxGraphModel') || t.includes('<diagram ');
}

function sniffImportKind(fileName, headText, headBytes) {
    const lower = (fileName || '').toLowerCase();
    if (lower.endsWith('.zip')) return 'zip';
    if (lower.endsWith('.pdf')) return 'pdf';
    if (lower.endsWith('.svg')) return 'svg';
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'excel';
    if (lower.endsWith('.docx') || lower.endsWith('.doc')) return 'word';
    if (lower.endsWith('.drawio') || lower.endsWith('.xml')) {
        const headSliceXml = (headText || '').trimStart().slice(0, 1024);
        if (headSliceXml && /<svg[\s>/]/i.test(headSliceXml)) return 'svg';
        if (headText && isDrawioXml(headText)) return 'drawio';
        return lower.endsWith('.drawio') ? 'drawio' : 'xml';
    }
    if (headBytes && headBytes.length >= 4) {
        if (headBytes[0] === 0x25 && headBytes[1] === 0x50 && headBytes[2] === 0x44 && headBytes[3] === 0x46) return 'pdf';
        if (headBytes[0] === 0x50 && headBytes[1] === 0x4b) return 'zip';
    }
    if (headText && isDrawioXml(headText)) return 'drawio';
    const headSlice = (headText || '').trimStart().slice(0, 1024);
    if (headSlice && /<svg[\s>/]/i.test(headSlice)) return 'svg';
    return 'unknown';
}

function sanitizeImportTitle(fileName) {
    const base = (fileName || '').replace(/^.*[/\\]/, '').replace(/\.[^.]+$/, '');
    return base.replace(/[_-]+/g, ' ').trim() || 'Imported';
}

function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[data-team-process-hub="${src}"]`)) {
            resolve();
            return;
        }
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.dataset.teamProcessHub = src;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Failed to load script'));
        document.head.appendChild(s);
    });
}

async function ensureExcalidrawBundle() {
    const bundle = window.TeamExcalidrawBundle;
    const mount = bundle?.mountTeamExcalidraw ?? bundle?.default?.mountTeamExcalidraw;
    if (typeof mount === 'function') return;
    const v = typeof window.BUILD_VERSION !== 'undefined' ? window.BUILD_VERSION : Date.now();
    await loadScriptOnce(`/dist/excalidraw-team-bundle.js?v=${v}`);
    const b = window.TeamExcalidrawBundle;
    const m = b?.mountTeamExcalidraw ?? b?.default?.mountTeamExcalidraw;
    if (typeof m !== 'function') throw new Error('Excalidraw bundle missing');
}

async function ensureJSZip() {
    if (window.JSZip) return window.JSZip;
    await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    if (!window.JSZip) throw new Error('JSZip failed to load');
    return window.JSZip;
}

function genCanvasElId() {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 11)}`;
}

async function ensurePdfJs() {
    if (window.pdfjsLib) return window.pdfjsLib;
    await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
    const pdfjsLib = window.pdfjsLib;
    if (!pdfjsLib) throw new Error('pdf.js failed to load');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    return pdfjsLib;
}

/** Rasterize PDF page → Excalidraw canvasData with a locked dim image as trace background. */
async function buildTraceCanvasDataFromPdf(file, pageNum, viewBackgroundColor) {
    const pdfjsLib = await ensurePdfJs();
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const page = await pdf.getPage(pageNum);
    const scale = 2;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const renderTask = page.render({ canvasContext: ctx, viewport });
    await renderTask.promise;
    const dataURL = canvas.toDataURL('image/png');
    const fileId = genCanvasElId();
    const imageId = genCanvasElId();
    const files = {
        [fileId]: {
            mimeType: 'image/png',
            id: fileId,
            dataURL,
            created: Date.now(),
            lastRetrieved: Date.now()
        }
    };
    const elements = [
        {
            type: 'image',
            id: imageId,
            x: 0,
            y: 0,
            width: viewport.width,
            height: viewport.height,
            angle: 0,
            strokeColor: '#000000',
            backgroundColor: 'transparent',
            fillStyle: 'solid',
            strokeWidth: 1,
            strokeStyle: 'solid',
            roughness: 0,
            opacity: 38,
            groupIds: [],
            roundness: null,
            seed: Math.floor(Math.random() * 1e9),
            version: 1,
            versionNonce: Math.floor(Math.random() * 1e9),
            isDeleted: false,
            boundElements: null,
            updated: Date.now(),
            link: null,
            locked: true,
            status: 'saved',
            fileId,
            scale: [1, 1],
            crop: null,
            frameId: null
        }
    ];
    return {
        elements,
        files,
        appState: {
            viewBackgroundColor: viewBackgroundColor || '#ffffff',
            gridSize: null,
            zenModeEnabled: false
        }
    };
}

/** Binary-safe base64; avoids browsers emitting non-base64 data URLs for SVG/text (breaks /api/files). */
function uint8ArrayToBase64(bytes) {
    const chunkSize = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

async function fileToBase64DataUrl(file) {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let mime = file.type && file.type.length ? file.type : 'application/octet-stream';
    const lower = (file.name || '').toLowerCase();
    if (!file.type) {
        if (lower.endsWith('.svg')) mime = 'image/svg+xml';
        else if (lower.endsWith('.pdf')) mime = 'application/pdf';
    }
    return `data:${mime};base64,${uint8ArrayToBase64(bytes)}`;
}

async function uploadTeamFile(file, token) {
    const dataUrl = await fileToBase64DataUrl(file);
    const response = await fetch('/api/files', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: file.name,
            dataUrl,
            folder: PROCESS_FILE_FOLDER
        })
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Upload failed: ${response.status}`);
    }
    const data = await response.json();
    const url = data.data?.url || data.url;
    if (!url) throw new Error('No URL from upload');
    return { url, name: file.name, mimeType: file.type || 'application/octet-stream' };
}

function sniffFileKind(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
            const buf = new Uint8Array(reader.result);
            const headLen = Math.min(8192, buf.length);
            let headText = '';
            try {
                headText = new TextDecoder('utf-8', { fatal: false }).decode(buf.slice(0, headLen));
            } catch (_) {}
            resolve(sniffImportKind(file.name, headText, buf.slice(0, 8)));
        };
        reader.onerror = () => resolve(sniffImportKind(file.name, '', null));
        reader.readAsArrayBuffer(file.slice(0, Math.min(file.size, 65536)));
    });
}

const TeamProcessHub = ({ team, isDark, searchTerm = '' }) => {
    const ds = window.dataService;

    const [workflows, setWorkflows] = useState([]);
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterChip, setFilterChip] = useState('all');
    const [selected, setSelected] = useState(null);
    const [saveStatus, setSaveStatus] = useState('idle');
    const [importDragging, setImportDragging] = useState(false);
    const [importQueue, setImportQueue] = useState([]);
    const [pdfImportChoice, setPdfImportChoice] = useState(null);
    const [leftWidth, setLeftWidth] = useState(380);
    const [resizeDrag, setResizeDrag] = useState(null);
    const [libraryCollapsed, setLibraryCollapsed] = useState(() => {
        try {
            return sessionStorage.getItem('team_process_hub_library_collapsed') === '1';
        } catch (_) {
            return false;
        }
    });
    const [workflowTitleEdit, setWorkflowTitleEdit] = useState('');

    const excalidrawHostRef = useRef(null);
    const excalUnmountRef = useRef(null);
    const drawioIframeRef = useRef(null);
    const saveTimerRef = useRef(null);
    const pendingExcalidrawRef = useRef(null);
    const prefersReducedMotion =
        typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const loadAll = useCallback(
        async (silent) => {
            if (!team?.id || !ds?.getTeamWorkflows || !ds?.getTeamDocuments) return;
            if (!silent) setLoading(true);
            try {
                const [wf, doc] = await Promise.all([ds.getTeamWorkflows(team.id), ds.getTeamDocuments(team.id)]);
                setWorkflows(Array.isArray(wf) ? wf : []);
                setDocuments(Array.isArray(doc) ? doc : []);
            } catch (e) {
                console.error('TeamProcessHub load:', e);
                setWorkflows([]);
                setDocuments([]);
            } finally {
                if (!silent) setLoading(false);
            }
        },
        [team?.id, ds]
    );

    useEffect(() => {
        loadAll(false);
    }, [loadAll]);

    const artifacts = useMemo(() => {
        const wf = workflows.map((w) => ({
            kind: 'workflow',
            id: w.id,
            title: w.title || 'Untitled flow',
            updatedAt: w.updatedAt,
            sub: w.canvasKind === 'drawio' ? 'Diagram · draw.io' : w.canvasKind === 'excalidraw' ? 'Diagram · Excalidraw' : 'Flow',
            raw: w
        }));
        const doc = documents.map((d) => ({
            kind: 'document',
            id: d.id,
            title: d.title || 'Untitled document',
            updatedAt: d.updatedAt,
            sub: 'Document · files & notes',
            raw: d
        }));
        const merged = [...wf, ...doc].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        const q = (searchTerm || '').trim().toLowerCase();
        let list = merged;
        if (q) {
            list = merged.filter((x) => x.title.toLowerCase().includes(q) || x.sub.toLowerCase().includes(q));
        }
        if (filterChip === 'diagrams') {
            list = list.filter((x) => x.kind === 'workflow');
        }
        if (filterChip === 'docs') {
            list = list.filter((x) => x.kind === 'document');
        }
        return list;
    }, [workflows, documents, searchTerm, filterChip]);

    const selectedWorkflow = selected?.kind === 'workflow' ? selected.raw : null;
    const selectedDocument = selected?.kind === 'document' ? selected.raw : null;

    useEffect(() => {
        if (selectedWorkflow) setWorkflowTitleEdit(selectedWorkflow.title || '');
    }, [selectedWorkflow?.id, selectedWorkflow?.title]);

    const setLibraryCollapsedPersist = useCallback((next) => {
        setLibraryCollapsed(next);
        try {
            sessionStorage.setItem('team_process_hub_library_collapsed', next ? '1' : '0');
        } catch (_) {}
    }, []);

    const handleDeleteWorkflow = async () => {
        if (!selectedWorkflow?.id || !ds?.deleteTeamWorkflow) return;
        if (!window.confirm('Delete this process flow? This cannot be undone.')) return;
        try {
            await ds.deleteTeamWorkflow(selectedWorkflow.id);
            setSelected(null);
            await loadAll(true);
        } catch (e) {
            window.alert(e.message || 'Delete failed');
        }
    };

    const persistWorkflowPatch = useCallback(
        async (id, patch) => {
            if (!ds?.updateTeamWorkflow) return;
            setSaveStatus('saving');
            try {
                await ds.updateTeamWorkflow(id, patch);
                setSaveStatus('saved');
                setTimeout(() => setSaveStatus('idle'), 1600);
                await loadAll(true);
            } catch (e) {
                console.error(e);
                setSaveStatus('idle');
                window.alert(e.message || 'Save failed');
            }
        },
        [ds, loadAll]
    );

    const scheduleExcalidrawSave = useCallback(
        (workflowId, data) => {
            pendingExcalidrawRef.current = data;
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            saveTimerRef.current = setTimeout(() => {
                const payload = pendingExcalidrawRef.current;
                if (!payload || !workflowId) return;
                persistWorkflowPatch(workflowId, {
                    canvasKind: 'excalidraw',
                    canvasData: payload
                });
            }, 900);
        },
        [persistWorkflowPatch]
    );

    useEffect(() => {
        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        };
    }, []);

    useEffect(() => {
        if (excalUnmountRef.current) {
            try {
                excalUnmountRef.current();
            } catch (_) {}
            excalUnmountRef.current = null;
        }
        if (window.TeamExcalidrawBundle?.unmountTeamExcalidraw) {
            try {
                window.TeamExcalidrawBundle.unmountTeamExcalidraw();
            } catch (_) {}
        }

        if (!selectedWorkflow || selectedWorkflow.canvasKind !== 'excalidraw') return undefined;

        let cancelled = false;
        (async () => {
            try {
                await ensureExcalidrawBundle();
                if (cancelled || !excalidrawHostRef.current) return;
                const b = window.TeamExcalidrawBundle;
                const mount = b.mountTeamExcalidraw || (b.default && b.default.mountTeamExcalidraw);
                const cd = selectedWorkflow.canvasData;
                let initialData = null;
                if (cd && typeof cd === 'object' && (cd.elements || cd.appState)) {
                    initialData = {
                        elements: cd.elements || [],
                        appState: cd.appState || {},
                        files: cd.files || null
                    };
                }
                const theme = isDark ? 'dark' : 'light';
                excalUnmountRef.current = mount(excalidrawHostRef.current, {
                    initialData,
                    theme,
                    viewModeEnabled: false,
                    onChange: (snap) => {
                        const { elements, appState, files } = snap;
                        scheduleExcalidrawSave(selectedWorkflow.id, { elements, appState, files: files || {} });
                    }
                });
            } catch (e) {
                console.error('Excalidraw mount:', e);
                window.alert(e.message || 'Could not load diagram editor');
            }
        })();

        return () => {
            cancelled = true;
            if (excalUnmountRef.current) {
                try {
                    excalUnmountRef.current();
                } catch (_) {}
                excalUnmountRef.current = null;
            }
        };
    }, [selectedWorkflow?.id, selectedWorkflow?.canvasKind, isDark, scheduleExcalidrawSave]);

    const drawioWorkflowIdRef = useRef(null);
    drawioWorkflowIdRef.current = selectedWorkflow?.canvasKind === 'drawio' ? selectedWorkflow.id : null;

    useEffect(() => {
        if (!selectedWorkflow || selectedWorkflow.canvasKind !== 'drawio') return undefined;

        const xml =
            selectedWorkflow.canvasData &&
            typeof selectedWorkflow.canvasData === 'object' &&
            selectedWorkflow.canvasData.drawioXml
                ? String(selectedWorkflow.canvasData.drawioXml)
                : '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>';

        const iframe = drawioIframeRef.current;
        if (!iframe) return undefined;

        const onMsg = (ev) => {
            if (ev.source !== iframe.contentWindow) return;
            let msg = ev.data;
            if (typeof msg === 'string') {
                try {
                    msg = JSON.parse(msg);
                } catch {
                    return;
                }
            }
            if (!msg || typeof msg !== 'object') return;
            if (msg.event === 'init') {
                iframe.contentWindow.postMessage(
                    JSON.stringify({
                        action: 'load',
                        autosave: true,
                        xml
                    }),
                    '*'
                );
            }
            const outXml = typeof msg.xml === 'string' ? msg.xml : null;
            const wid = drawioWorkflowIdRef.current;
            if (outXml && wid) {
                persistWorkflowPatch(wid, {
                    canvasKind: 'drawio',
                    canvasData: { drawioXml: outXml }
                });
            }
        };
        window.addEventListener('message', onMsg);
        iframe.src = DRAWIO_EMBED;
        return () => window.removeEventListener('message', onMsg);
    }, [selectedWorkflow?.id, selectedWorkflow?.canvasKind, persistWorkflowPatch]);

    const handleNewFlow = async () => {
        if (!team?.id || !ds?.createTeamWorkflow) return;
        try {
            const w = await ds.createTeamWorkflow({
                teamId: team.id,
                title: 'New process flow',
                description: '',
                status: 'Draft',
                steps: [],
                canvasKind: 'excalidraw',
                canvasData: null,
                tags: []
            });
            await loadAll(true);
            setSelected({ kind: 'workflow', id: w.id, title: w.title, updatedAt: w.updatedAt, sub: '', raw: w });
        } catch (e) {
            window.alert(e.message || 'Could not create flow');
        }
    };

    const handleNewDoc = async () => {
        if (!team?.id || !ds?.createTeamDocument) return;
        try {
            const d = await ds.createTeamDocument({
                teamId: team.id,
                title: 'New document',
                category: 'Process',
                description: '',
                content: '',
                attachments: [],
                tags: []
            });
            await loadAll(true);
            setSelected({ kind: 'document', id: d.id, title: d.title, updatedAt: d.updatedAt, sub: '', raw: d });
        } catch (e) {
            window.alert(e.message || 'Could not create document');
        }
    };

    const handlePdfImportDocumentOnly = async () => {
        const file = pdfImportChoice?.file;
        if (!file || !team?.id || !ds?.createTeamDocument) return;
        const token = window.storage?.getToken?.() || localStorage.getItem('abcotronics_token');
        if (!token) {
            window.alert('Not authenticated');
            return;
        }
        setPdfImportChoice(null);
        const qid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setImportQueue((q) => [...q, { id: qid, name: file.name, status: 'working', error: null }]);
        try {
            const up = await uploadTeamFile(file, token);
            await ds.createTeamDocument({
                teamId: team.id,
                title: sanitizeImportTitle(file.name),
                category: 'Imported',
                description: '',
                content: '',
                attachments: [{ name: up.name, url: up.url, mimeType: up.mimeType }],
                tags: ['imported']
            });
            setImportQueue((q) => q.map((x) => (x.id === qid ? { ...x, status: 'done' } : x)));
            await loadAll(true);
        } catch (e) {
            setImportQueue((q) =>
                q.map((x) => (x.id === qid ? { ...x, status: 'error', error: e.message || 'Failed' } : x))
            );
        }
    };

    const handlePdfImportTrace = async () => {
        const file = pdfImportChoice?.file;
        if (!file || !team?.id || !ds?.createTeamWorkflow) return;
        setPdfImportChoice(null);
        const qid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setImportQueue((q) => [...q, { id: qid, name: file.name, status: 'working', error: null }]);
        try {
            const viewBg = isDark ? '#121212' : '#ffffff';
            const canvasData = await buildTraceCanvasDataFromPdf(file, 1, viewBg);
            const w = await ds.createTeamWorkflow({
                teamId: team.id,
                title: `${sanitizeImportTitle(file.name)} (trace)`,
                description: 'Raster trace layer from PDF page 1 — draw over the dim background.',
                status: 'Draft',
                steps: [],
                canvasKind: 'excalidraw',
                canvasData,
                tags: ['imported', 'trace-pdf']
            });
            await loadAll(true);
            setSelected({ kind: 'workflow', id: w.id, title: w.title, updatedAt: w.updatedAt, sub: '', raw: w });
            setImportQueue((q) => q.map((x) => (x.id === qid ? { ...x, status: 'done' } : x)));
        } catch (e) {
            setImportQueue((q) =>
                q.map((x) => (x.id === qid ? { ...x, status: 'error', error: e.message || 'Failed' } : x))
            );
        }
    };

    const handlePdfImportSketch = async () => {
        const file = pdfImportChoice?.file;
        if (!file || !team?.id || !ds?.createTeamWorkflow) return;
        if (!ds.convertPdfToSketch) {
            window.alert('Please refresh the page to enable PDF sketch import.');
            return;
        }
        setPdfImportChoice(null);
        const qid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setImportQueue((q) => [...q, { id: qid, name: file.name, status: 'working', error: null }]);
        try {
            const dataUrl = await fileToBase64DataUrl(file);
            const { canvasData, meta } = await ds.convertPdfToSketch(dataUrl, 1);
            const warns = Array.isArray(meta?.warnings) ? meta.warnings.filter(Boolean) : [];
            if (warns.length) window.alert(`Sketch import notes:\n\n${warns.join('\n')}`);
            const w = await ds.createTeamWorkflow({
                teamId: team.id,
                title: `${sanitizeImportTitle(file.name)} (sketch)`,
                description:
                    meta?.converter === 'poppler-svg'
                        ? 'Experimental vector sketch from PDF (server).'
                        : 'Experimental sketch — server vector extraction unavailable; shapes may be empty.',
                status: 'Draft',
                steps: [],
                canvasKind: 'excalidraw',
                canvasData,
                tags: ['imported', 'pdf-sketch']
            });
            await loadAll(true);
            setSelected({ kind: 'workflow', id: w.id, title: w.title, updatedAt: w.updatedAt, sub: '', raw: w });
            setImportQueue((q) => q.map((x) => (x.id === qid ? { ...x, status: 'done' } : x)));
        } catch (e) {
            setImportQueue((q) =>
                q.map((x) => (x.id === qid ? { ...x, status: 'error', error: e.message || 'Failed' } : x))
            );
        }
    };

    const processIncomingFiles = async (fileList) => {
        const files = Array.from(fileList || []).filter(Boolean);
        if (!files.length || !team?.id) return;
        const token = window.storage?.getToken?.() || localStorage.getItem('abcotronics_token');
        if (!token) {
            window.alert('Not authenticated');
            return;
        }

        if (files.length === 1) {
            const onlyKind = await sniffFileKind(files[0]);
            if (onlyKind === 'pdf') {
                setPdfImportChoice({ file: files[0] });
                return;
            }
        }

        const processOneFile = async (file, kind, tok) => {
            if (kind === 'pdf' || kind === 'excel' || kind === 'word') {
                const up = await uploadTeamFile(file, tok);
                await ds.createTeamDocument({
                    teamId: team.id,
                    title: sanitizeImportTitle(file.name),
                    category: 'Imported',
                    description: '',
                    content: '',
                    attachments: [{ name: up.name, url: up.url, mimeType: up.mimeType }],
                    tags: ['imported']
                });
                return;
            }
            if (kind === 'svg') {
                const text = await file.text();
                try {
                    if (!ds.convertSvgToSketch) throw new Error('SVG import unavailable — refresh the page.');
                    const { canvasData, meta } = await ds.convertSvgToSketch(text);
                    const warns = Array.isArray(meta?.warnings) ? meta.warnings.filter(Boolean) : [];
                    if (warns.length) window.alert(`SVG import notes:\n\n${warns.join('\n')}`);
                    await ds.createTeamWorkflow({
                        teamId: team.id,
                        title: sanitizeImportTitle(file.name),
                        description: 'Imported from SVG (heuristic conversion to Excalidraw).',
                        status: 'Draft',
                        steps: [],
                        canvasKind: 'excalidraw',
                        canvasData,
                        tags: ['imported', 'svg']
                    });
                } catch (convErr) {
                    const up = await uploadTeamFile(file, tok);
                    await ds.createTeamDocument({
                        teamId: team.id,
                        title: sanitizeImportTitle(file.name),
                        category: 'Imported',
                        description: `Attached as file (SVG diagram conversion failed: ${convErr.message || 'error'}).`,
                        content: '',
                        attachments: [{ name: up.name, url: up.url, mimeType: up.mimeType }],
                        tags: ['imported']
                    });
                    window.alert(
                        `SVG could not be converted to a diagram (${convErr.message || 'error'}). The file was saved as a document attachment instead.`
                    );
                }
                return;
            }
            if (kind === 'drawio' || kind === 'xml') {
                const text = await file.text();
                if (!isDrawioXml(text) && kind !== 'drawio') {
                    await ds.createTeamDocument({
                        teamId: team.id,
                        title: sanitizeImportTitle(file.name),
                        category: 'Imported',
                        description: '',
                        content: `<pre>${text.slice(0, 5000)}</pre>`,
                        attachments: [],
                        tags: ['imported']
                    });
                    return;
                }
                await ds.createTeamWorkflow({
                    teamId: team.id,
                    title: sanitizeImportTitle(file.name),
                    description: '',
                    status: 'Draft',
                    steps: [],
                    canvasKind: 'drawio',
                    canvasData: { drawioXml: text },
                    tags: ['imported']
                });
                return;
            }
            const up = await uploadTeamFile(file, tok);
            await ds.createTeamDocument({
                teamId: team.id,
                title: sanitizeImportTitle(file.name),
                category: 'Imported',
                description: '',
                content: '',
                attachments: [{ name: up.name, url: up.url, mimeType: up.mimeType }],
                tags: ['imported']
            });
        };

        for (const file of files) {
            const qid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            setImportQueue((q) => [...q, { id: qid, name: file.name, status: 'working', error: null }]);
            try {
                const kind = await sniffFileKind(file);
                if (kind === 'zip') {
                    const JSZip = await ensureJSZip();
                    const buf = await file.arrayBuffer();
                    const zip = await JSZip.loadAsync(buf);
                    let count = 0;
                    for (const path of Object.keys(zip.files)) {
                        const entry = zip.files[path];
                        if (entry.dir || path.includes('__MACOSX') || path.includes('.DS_Store')) continue;
                        const u8 = await entry.async('uint8array');
                        const leaf = path.split('/').pop() || path;
                        const fakeFile = new File([u8], leaf, { type: 'application/octet-stream' });
                        const innerKind = await sniffFileKind(fakeFile);
                        if (innerKind === 'zip') continue;
                        await processOneFile(fakeFile, innerKind, token);
                        count++;
                    }
                    setImportQueue((q) => q.map((x) => (x.id === qid ? { ...x, status: 'done', detail: `${count} files` } : x)));
                } else {
                    await processOneFile(file, kind, token);
                    setImportQueue((q) => q.map((x) => (x.id === qid ? { ...x, status: 'done' } : x)));
                }
                await loadAll(true);
            } catch (e) {
                setImportQueue((q) =>
                    q.map((x) => (x.id === qid ? { ...x, status: 'error', error: e.message || 'Failed' } : x))
                );
            }
        }
    };

    const onSplitterMove = useCallback((e) => {
        if (!resizeDrag) return;
        const dx = e.clientX - resizeDrag.startX;
        const next = Math.min(Math.max(resizeDrag.startW + dx, 260), 560);
        setLeftWidth(next);
    }, [resizeDrag]);

    const onSplitterUp = useCallback(() => setResizeDrag(null), []);

    useEffect(() => {
        if (!resizeDrag) return undefined;
        window.addEventListener('mousemove', onSplitterMove);
        window.addEventListener('mouseup', onSplitterUp);
        return () => {
            window.removeEventListener('mousemove', onSplitterMove);
            window.removeEventListener('mouseup', onSplitterUp);
        };
    }, [resizeDrag, onSplitterMove, onSplitterUp]);

    const hubVars = isDark
        ? '[--ph-accent:#22d3ee] [--ph-accent-dim:rgba(34,211,238,0.14)] [--ph-mesh:rgba(15,23,42,0.97)]'
        : '[--ph-accent:#0284c7] [--ph-accent-dim:rgba(2,132,199,0.12)] [--ph-mesh:rgba(248,250,252,0.98)]';

    const meshBg = isDark
        ? 'radial-gradient(1200px 600px at 10% -10%, rgba(34,211,238,0.09), transparent 55%), radial-gradient(900px 500px at 90% 0%, rgba(59,130,246,0.06), transparent 50%)'
        : 'radial-gradient(1000px 500px at 8% -8%, rgba(2,132,199,0.07), transparent 55%), radial-gradient(800px 400px at 92% 4%, rgba(14,165,233,0.05), transparent 48%)';

    return (
        <div className={`team-process-hub rounded-2xl border overflow-hidden shadow-lg ${hubVars} ${isDark ? 'border-cyan-900/40 bg-gray-950/80' : 'border-sky-200/80 bg-white/95'}`}>
            <div
                className={`relative px-5 py-4 border-b ${isDark ? 'border-gray-800/90' : 'border-gray-200/90'}`}
                style={{ background: meshBg }}
            >
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 relative z-10">
                    <div>
                        <h2 className={`text-lg font-semibold tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            Process intelligence
                        </h2>
                        <p className={`text-sm mt-0.5 ${isDark ? 'text-cyan-100/70' : 'text-sky-900/65'}`}>
                            Diagrams, flowcharts, and team documents in one workspace.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={handleNewFlow}
                            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-md ${
                                isDark
                                    ? 'bg-gradient-to-r from-cyan-600 to-sky-700 text-white hover:from-cyan-500 hover:to-sky-600'
                                    : 'bg-gradient-to-r from-sky-600 to-cyan-600 text-white hover:from-sky-500 hover:to-cyan-500'
                            }`}
                        >
                            <i className="fas fa-project-diagram" aria-hidden />
                            New flow
                        </button>
                        <button
                            type="button"
                            onClick={handleNewDoc}
                            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                                isDark
                                    ? 'border-cyan-700/60 text-cyan-100 hover:bg-gray-900/80'
                                    : 'border-sky-300 text-sky-900 hover:bg-sky-50'
                            }`}
                        >
                            <i className="fas fa-file-alt" aria-hidden />
                            New document
                        </button>
                        <label
                            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium cursor-pointer border transition-all ${
                                isDark
                                    ? 'border-gray-600 text-gray-200 hover:border-cyan-600/60'
                                    : 'border-gray-300 text-gray-800 hover:border-sky-400'
                            }`}
                        >
                            <i className="fas fa-file-import" aria-hidden />
                            Import
                            <input
                                type="file"
                                multiple
                                className="hidden"
                                onChange={(e) => {
                                    processIncomingFiles(e.target.files);
                                    e.target.value = '';
                                }}
                            />
                        </label>
                        <div
                            className={`flex rounded-xl border p-0.5 ${isDark ? 'border-gray-700 bg-gray-900/60' : 'border-gray-200 bg-gray-50'}`}
                            role="group"
                            aria-label="Filter artifacts"
                        >
                            {['all', 'diagrams', 'docs'].map((chip) => (
                                <button
                                    key={chip}
                                    type="button"
                                    onClick={() => setFilterChip(chip)}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-lg capitalize transition-all ${
                                        filterChip === chip
                                            ? isDark
                                                ? 'bg-cyan-900/50 text-cyan-100 shadow-inner'
                                                : 'bg-white text-sky-900 shadow-sm'
                                            : isDark
                                              ? 'text-gray-400 hover:text-gray-200'
                                              : 'text-gray-600 hover:text-gray-900'
                                    }`}
                                >
                                    {chip}
                                </button>
                            ))}
                        </div>
                        {saveStatus !== 'idle' && (
                            <span
                                className={`text-xs font-mono px-2 py-1 rounded-lg ${
                                    saveStatus === 'saving'
                                        ? isDark
                                            ? 'text-amber-300 bg-amber-950/50'
                                            : 'text-amber-800 bg-amber-50'
                                        : isDark
                                          ? 'text-emerald-300 bg-emerald-950/40'
                                          : 'text-emerald-800 bg-emerald-50'
                                }`}
                            >
                                {saveStatus === 'saving' ? 'Saving…' : 'Saved'}
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={() => setLibraryCollapsedPersist(!libraryCollapsed)}
                            aria-pressed={libraryCollapsed}
                            title={libraryCollapsed ? 'Show library' : 'Hide library for more canvas space'}
                            className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-all ${
                                isDark
                                    ? 'border-gray-600 text-gray-200 hover:bg-gray-900'
                                    : 'border-gray-300 text-gray-800 hover:bg-gray-50'
                            }`}
                        >
                            <i className={`fas ${libraryCollapsed ? 'fa-indent' : 'fa-outdent'}`} aria-hidden />
                            {libraryCollapsed ? 'Library' : 'Hide library'}
                        </button>
                    </div>
                </div>
            </div>

            <div
                className={`mx-4 mt-4 mb-2 rounded-xl border-2 border-dashed flex flex-col items-center justify-center px-4 py-6 transition-all ${
                    importDragging
                        ? isDark
                            ? 'border-cyan-400 bg-cyan-950/30 shadow-[0_0_24px_var(--ph-accent-dim)]'
                            : 'border-sky-500 bg-sky-50 shadow-[0_0_20px_var(--ph-accent-dim)]'
                        : isDark
                          ? 'border-gray-700/80 bg-gray-900/40'
                          : 'border-gray-300/90 bg-gray-50/80'
                }`}
                onDragEnter={(e) => {
                    e.preventDefault();
                    setImportDragging(true);
                }}
                onDragOver={(e) => {
                    e.preventDefault();
                    setImportDragging(true);
                }}
                onDragLeave={() => setImportDragging(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setImportDragging(false);
                    processIncomingFiles(e.dataTransfer.files);
                }}
            >
                <i className={`fas fa-cloud-upload-alt text-2xl mb-2 ${isDark ? 'text-cyan-400/90' : 'text-sky-600'}`} />
                <p className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>Drop files or zip to import</p>
                <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                    PDF (attach / trace / sketch), SVG → diagram, Excel, Word, .drawio / XML, zip. Uploads use server-safe encoding.
                </p>
            </div>

            {importQueue.length > 0 && (
                <div className={`mx-4 mb-2 rounded-lg border text-xs font-mono px-3 py-2 space-y-1 ${isDark ? 'border-gray-700 bg-gray-900/70' : 'border-gray-200 bg-gray-50'}`}>
                    {importQueue.slice(-6).map((row) => (
                        <div key={row.id} className="flex justify-between gap-2">
                            <span className={`truncate ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{row.name}</span>
                            <span
                                className={
                                    row.status === 'error'
                                        ? 'text-red-400'
                                        : row.status === 'done'
                                          ? isDark
                                              ? 'text-emerald-400'
                                              : 'text-emerald-700'
                                          : isDark
                                            ? 'text-amber-300'
                                            : 'text-amber-700'
                                }
                            >
                                {row.status === 'working' ? '…' : row.status}
                                {row.error ? ` — ${row.error}` : ''}
                                {row.detail ? ` (${row.detail})` : ''}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex min-h-[520px] relative">
                {!libraryCollapsed && (
                <div style={{ width: leftWidth, minWidth: 260, maxWidth: 560 }} className={`flex flex-col border-r ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
                    <div className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                        Library
                    </div>
                    <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-2">
                        {loading && (
                            <div className={`flex items-center justify-center py-12 text-sm ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                                <span className="animate-spin mr-2 inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full" />
                                Loading…
                            </div>
                        )}
                        {!loading &&
                            artifacts.map((a, idx) => {
                                const active = selected?.kind === a.kind && selected?.id === a.id;
                                const delay = prefersReducedMotion ? '0ms' : `${idx * 42}ms`;
                                return (
                                    <button
                                        key={`${a.kind}-${a.id}`}
                                        type="button"
                                        onClick={() => setSelected(a)}
                                        style={{ animationDelay: delay }}
                                        className={`w-full text-left rounded-xl border px-3 py-3 transition-all duration-200 relative overflow-hidden group ${
                                            active
                                                ? isDark
                                                    ? 'border-cyan-500/70 bg-gray-900 shadow-[inset_3px_0_0_0_var(--ph-accent)]'
                                                    : 'border-sky-400 bg-sky-50/90 shadow-[inset_3px_0_0_0_var(--ph-accent)]'
                                                : isDark
                                                  ? 'border-gray-800 hover:border-cyan-800 hover:-translate-y-0.5 hover:shadow-lg bg-gray-900/50'
                                                  : 'border-gray-200 hover:border-sky-300 hover:-translate-y-0.5 hover:shadow-md bg-white'
                                        }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <span
                                                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm ${
                                                    a.kind === 'workflow'
                                                        ? isDark
                                                            ? 'bg-cyan-950 text-cyan-300'
                                                            : 'bg-sky-100 text-sky-700'
                                                        : isDark
                                                          ? 'bg-gray-800 text-gray-300'
                                                          : 'bg-gray-100 text-gray-600'
                                                }`}
                                            >
                                                <i className={`fas ${a.kind === 'workflow' ? 'fa-sitemap' : 'fa-file-alt'}`} />
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className={`font-medium truncate ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{a.title}</div>
                                                <div className={`text-xs mt-0.5 font-mono ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>{a.sub}</div>
                                                <div className={`text-[10px] mt-1 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                                                    {new Date(a.updatedAt).toLocaleString()}
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        {!loading && artifacts.length === 0 && (
                            <div className={`px-4 py-16 text-center rounded-xl border border-dashed ${isDark ? 'border-gray-700 text-gray-400' : 'border-gray-300 text-gray-600'}`}>
                                <svg className="w-16 h-16 mx-auto mb-3 opacity-40" viewBox="0 0 120 120" fill="none" aria-hidden>
                                    <circle cx="40" cy="60" r="8" stroke="currentColor" strokeWidth="2" />
                                    <circle cx="80" cy="40" r="8" stroke="currentColor" strokeWidth="2" />
                                    <circle cx="80" cy="80" r="8" stroke="currentColor" strokeWidth="2" />
                                    <path d="M48 58 L72 44 M48 62 L72 76 M72 48 L72 72" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
                                </svg>
                                <p className="font-medium">Nothing here yet</p>
                                <p className="text-sm mt-1 mb-4">Create a flow or import process files for this team.</p>
                                <div className="flex flex-wrap justify-center gap-2">
                                    <button
                                        type="button"
                                        onClick={handleNewFlow}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium ${isDark ? 'bg-cyan-800 text-white' : 'bg-sky-600 text-white'}`}
                                    >
                                        New flow
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => document.querySelector('.team-process-hub input[type=file]')?.click()}
                                        className={`px-4 py-2 rounded-lg text-sm border ${isDark ? 'border-gray-600' : 'border-gray-300'}`}
                                    >
                                        Import
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                )}

                {!libraryCollapsed && (
                <div
                    role="separator"
                    aria-orientation="vertical"
                    className={`w-1.5 cursor-col-resize shrink-0 group flex items-center justify-center ${isDark ? 'bg-gray-900' : 'bg-gray-100'}`}
                    onMouseDown={(e) => setResizeDrag({ startX: e.clientX, startW: leftWidth })}
                >
                    <span className={`w-0.5 h-10 rounded-full ${isDark ? 'bg-cyan-800 group-hover:bg-cyan-500' : 'bg-gray-300 group-hover:bg-sky-400'}`} />
                </div>
                )}

                {libraryCollapsed && (
                    <button
                        type="button"
                        onClick={() => setLibraryCollapsedPersist(false)}
                        title="Show library"
                        className={`shrink-0 w-11 flex flex-col items-center justify-center gap-1 py-4 border-r text-[10px] font-semibold uppercase tracking-wide ${
                            isDark ? 'border-gray-800 bg-gray-900/90 text-cyan-400 hover:bg-gray-900' : 'border-gray-200 bg-gray-100 text-sky-700 hover:bg-gray-50'
                        }`}
                    >
                        <i className="fas fa-folder-open text-lg" aria-hidden />
                        <span className="max-h-[120px] overflow-hidden text-center leading-tight" style={{ writingMode: 'vertical-rl' }}>
                            Library
                        </span>
                    </button>
                )}

                <div className={`flex-1 min-w-0 flex flex-col min-h-0 ${isDark ? 'bg-gray-950/50' : 'bg-gray-50/80'}`}>
                    {selectedWorkflow && (
                        <div
                            className={`flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b shrink-0 ${
                                isDark ? 'border-gray-800 bg-gray-900/85' : 'border-gray-200 bg-white/95'
                            }`}
                        >
                            <input
                                value={workflowTitleEdit}
                                onChange={(e) => setWorkflowTitleEdit(e.target.value)}
                                onBlur={async () => {
                                    if (!selectedWorkflow?.id || !ds?.updateTeamWorkflow) return;
                                    const t = workflowTitleEdit.trim();
                                    if (!t || t === (selectedWorkflow.title || '')) return;
                                    setSaveStatus('saving');
                                    try {
                                        await ds.updateTeamWorkflow(selectedWorkflow.id, { title: t });
                                        setSaveStatus('saved');
                                        setTimeout(() => setSaveStatus('idle'), 1600);
                                        await loadAll(true);
                                        setSelected((s) =>
                                            s?.kind === 'workflow' && s.id === selectedWorkflow.id
                                                ? { ...s, title: t, raw: { ...s.raw, title: t } }
                                                : s
                                        );
                                    } catch (e) {
                                        window.alert(e.message || 'Could not save title');
                                        setSaveStatus('idle');
                                    }
                                }}
                                className={`flex-1 min-w-[160px] text-lg font-semibold bg-transparent border-b border-transparent focus:border-cyan-500 outline-none ${
                                    isDark ? 'text-white placeholder:text-gray-600' : 'text-gray-900 placeholder:text-gray-400'
                                }`}
                                placeholder="Flow title"
                                aria-label="Flow title"
                            />
                            <button
                                type="button"
                                onClick={handleDeleteWorkflow}
                                className={`text-sm px-3 py-1.5 rounded-lg border shrink-0 ${
                                    isDark ? 'border-red-900 text-red-400 hover:bg-red-950/40' : 'border-red-200 text-red-700 hover:bg-red-50'
                                }`}
                            >
                                Delete
                            </button>
                        </div>
                    )}
                    {!selected && (
                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                            <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>Select an item or create a new flow.</p>
                        </div>
                    )}
                    {selectedWorkflow && selectedWorkflow.canvasKind === 'excalidraw' && (
                        <div className="flex-1 flex flex-col min-h-0 p-3">
                            <div className={`rounded-2xl border overflow-hidden flex-1 min-h-[min(70vh,560px)] shadow-inner ${isDark ? 'border-gray-800 bg-black/40' : 'border-gray-200 bg-white'}`}>
                                <div ref={excalidrawHostRef} className="w-full h-full min-h-[360px]" />
                            </div>
                        </div>
                    )}
                    {selectedWorkflow && selectedWorkflow.canvasKind === 'drawio' && (
                        <div className="flex-1 flex flex-col min-h-0 p-3">
                            <iframe
                                key={selectedWorkflow.id}
                                title="draw.io"
                                ref={drawioIframeRef}
                                className="w-full flex-1 min-h-[500px] rounded-2xl border border-gray-700/50 bg-white"
                                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                            />
                        </div>
                    )}
                    {selectedWorkflow && !selectedWorkflow.canvasKind && (
                        <div className="p-6 text-sm text-gray-500">Legacy workflow record — open in API or add canvas kind.</div>
                    )}
                    {selectedDocument && (
                        <DocumentDetailPane
                            doc={selectedDocument}
                            isDark={isDark}
                            onUpdate={async (patch) => {
                                await ds.updateTeamDocument(selectedDocument.id, patch);
                                await loadAll(true);
                                const fresh = (await ds.getTeamDocuments(team.id)).find((d) => d.id === selectedDocument.id);
                                if (fresh) setSelected({ kind: 'document', id: fresh.id, title: fresh.title, updatedAt: fresh.updatedAt, sub: '', raw: fresh });
                            }}
                            onDelete={async () => {
                                if (!window.confirm('Delete this document?')) return;
                                await ds.deleteTeamDocument(selectedDocument.id);
                                setSelected(null);
                                await loadAll(true);
                            }}
                        />
                    )}
                </div>
            </div>

            {pdfImportChoice?.file && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/55 backdrop-blur-[2px]"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="pdf-import-choice-title"
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) setPdfImportChoice(null);
                    }}
                >
                    <div
                        className={`max-w-md w-full rounded-2xl border shadow-2xl p-6 space-y-4 ${
                            isDark ? 'border-gray-700 bg-gray-900 text-gray-100' : 'border-gray-200 bg-white text-gray-900'
                        }`}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div>
                            <h3 id="pdf-import-choice-title" className="text-lg font-semibold">
                                Import PDF
                            </h3>
                            <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                <span className="font-mono text-xs break-all">{pdfImportChoice.file.name}</span>
                            </p>
                            <p className={`text-xs mt-2 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                                Trace uses page 1 as a dim locked layer in Excalidraw. Sketch uses server-side vector extraction
                                (Poppler) when available.
                            </p>
                        </div>
                        <div className="flex flex-col gap-2">
                            <button
                                type="button"
                                onClick={handlePdfImportDocumentOnly}
                                className={`w-full rounded-xl px-4 py-2.5 text-sm font-medium border text-left ${
                                    isDark ? 'border-gray-600 hover:bg-gray-800' : 'border-gray-300 hover:bg-gray-50'
                                }`}
                            >
                                <span className="block font-semibold">Attach as document only</span>
                                <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                    Upload file and open as team document (existing behavior).
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={handlePdfImportTrace}
                                className={`w-full rounded-xl px-4 py-2.5 text-sm font-medium border text-left ${
                                    isDark ? 'border-cyan-800 hover:bg-cyan-950/40' : 'border-sky-300 hover:bg-sky-50'
                                }`}
                            >
                                <span className="block font-semibold">New flow — trace mode</span>
                                <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                    Raster page 1 as background; draw on top in Excalidraw.
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={handlePdfImportSketch}
                                className={`w-full rounded-xl px-4 py-2.5 text-sm font-medium border text-left ${
                                    isDark ? 'border-amber-900/60 hover:bg-amber-950/30' : 'border-amber-300 hover:bg-amber-50'
                                }`}
                            >
                                <span className="block font-semibold">New flow — experimental sketch</span>
                                <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                    Heuristic SVG→shapes (best when Poppler is on the server).
                                </span>
                            </button>
                        </div>
                        <div className="flex justify-end pt-1">
                            <button
                                type="button"
                                onClick={() => setPdfImportChoice(null)}
                                className={`text-sm px-3 py-1.5 rounded-lg ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

function DocumentDetailPane({ doc, isDark, onUpdate, onDelete }) {
    const [title, setTitle] = useState(doc.title || '');
    const [content, setContent] = useState(doc.content || '');
    useEffect(() => {
        setTitle(doc.title || '');
        setContent(doc.content || '');
    }, [doc.id, doc.title, doc.content]);

    let safeAttachments = [];
    if (Array.isArray(doc.attachments)) safeAttachments = doc.attachments;
    else if (typeof doc.attachments === 'string') {
        try {
            safeAttachments = JSON.parse(doc.attachments || '[]');
        } catch (_) {
            safeAttachments = [];
        }
    }
    if (!Array.isArray(safeAttachments)) safeAttachments = [];

    const firstPdf = safeAttachments.find((a) => (a.mimeType && a.mimeType.includes('pdf')) || (a.name || '').toLowerCase().endsWith('.pdf'));

    return (
        <div className={`flex-1 overflow-y-auto p-5 space-y-4 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
            <div className="flex justify-between gap-2 flex-wrap items-center">
                <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={() => onUpdate({ title: title.trim() })}
                    className={`text-xl font-semibold bg-transparent border-b border-transparent focus:border-cyan-500 outline-none flex-1 min-w-[200px] ${isDark ? 'text-white' : 'text-gray-900'}`}
                />
                <button
                    type="button"
                    onClick={onDelete}
                    className={`text-sm px-3 py-1.5 rounded-lg border ${isDark ? 'border-red-900 text-red-400' : 'border-red-200 text-red-700'}`}
                >
                    Delete
                </button>
            </div>
            <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onBlur={() => onUpdate({ content })}
                placeholder="Notes, SOP text, or checklist…"
                rows={8}
                className={`w-full rounded-xl border px-3 py-2 text-sm font-sans ${isDark ? 'bg-gray-900 border-gray-700 text-gray-100' : 'bg-white border-gray-300'}`}
            />
            <div>
                <h3 className={`text-sm font-semibold mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Attachments</h3>
                <ul className="space-y-2">
                    {safeAttachments.length === 0 && <li className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>No files attached.</li>}
                    {safeAttachments.map((att, i) => (
                        <li key={i} className="text-sm">
                            <a
                                href={att.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`underline ${isDark ? 'text-cyan-400' : 'text-sky-700'}`}
                            >
                                {att.name || att.url}
                            </a>
                        </li>
                    ))}
                </ul>
                {firstPdf && (
                    <iframe
                        title={firstPdf.name || 'PDF'}
                        src={firstPdf.url}
                        className={`w-full h-[min(70vh,520px)] rounded-xl border mt-4 ${isDark ? 'border-gray-700' : 'border-gray-300'}`}
                    />
                )}
            </div>
        </div>
    );
}

window.TeamProcessHub = TeamProcessHub;
