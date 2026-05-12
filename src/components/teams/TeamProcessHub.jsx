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

function parseTagList(tags) {
    if (Array.isArray(tags)) return tags.filter((t) => typeof t === 'string');
    if (typeof tags === 'string') {
        try {
            const parsed = JSON.parse(tags || '[]');
            return Array.isArray(parsed) ? parsed.filter((t) => typeof t === 'string') : [];
        } catch (_) {
            return [];
        }
    }
    return [];
}

function getHubGroupNameFromTags(tags) {
    const list = parseTagList(tags);
    const marker = list.find((t) => t.startsWith('hub-group:'));
    if (!marker) return '';
    return marker.slice('hub-group:'.length).trim();
}

function withHubGroupTag(tags, groupName) {
    const list = parseTagList(tags).filter((t) => !t.startsWith('hub-group:'));
    const next = (groupName || '').trim();
    if (next) list.push(`hub-group:${next}`);
    return list;
}

const TeamProcessHub = ({ team, isDark, searchTerm = '' }) => {
    const ds = window.dataService;

    const [workflows, setWorkflows] = useState([]);
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterChip, setFilterChip] = useState('all');
    const [selected, setSelected] = useState(null);
    const [importQueue, setImportQueue] = useState([]);
    const [pdfImportChoice, setPdfImportChoice] = useState(null);
    const [leftWidth, setLeftWidth] = useState(380);
    const [resizeDrag, setResizeDrag] = useState(null);
    const [libraryCollapsed, setLibraryCollapsed] = useState(() => {
        try {
            if (typeof localStorage !== 'undefined' && localStorage.getItem('team_process_hub_library_collapsed') === '1') {
                return true;
            }
            return sessionStorage.getItem('team_process_hub_library_collapsed') === '1';
        } catch (_) {
            return false;
        }
    });
    const [workflowTitleEdit, setWorkflowTitleEdit] = useState('');
    /** Inline rename in library list (workflows + documents). */
    const [renameTarget, setRenameTarget] = useState(null);
    const [renameDraft, setRenameDraft] = useState('');
    const skipListRenameBlurRef = useRef(false);
    /** Non-blocking notes after SVG/PDF sketch import (avoids modal spam when Poppler is missing). */
    const [hubBanner, setHubBanner] = useState(null);

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

    const openedProcessDocFromUrlRef = useRef(false);
    useEffect(() => {
        openedProcessDocFromUrlRef.current = false;
    }, [team?.id]);

    useEffect(() => {
        if (loading || !documents.length) return;
        if (openedProcessDocFromUrlRef.current) return;
        let want = '';
        try {
            const hash = window.location.hash || '';
            const qi = hash.indexOf('?');
            if (qi !== -1) {
                want = new URLSearchParams(hash.slice(qi + 1)).get('processDoc') || '';
            }
        } catch (_) {
            want = '';
        }
        if (!want) return;
        const found = documents.find((d) => String(d.id) === String(want));
        if (!found) return;
        openedProcessDocFromUrlRef.current = true;
        setSelected({
            kind: 'document',
            id: found.id,
            title: found.title,
            updatedAt: found.updatedAt,
            sub: '',
            raw: found
        });
    }, [loading, documents]);

    const artifacts = useMemo(() => {
        const wf = workflows.map((w) => ({
            kind: 'workflow',
            id: w.id,
            title: w.title || 'Untitled flow',
            updatedAt: w.updatedAt,
            groupName: getHubGroupNameFromTags(w.tags),
            sub: w.canvasKind === 'drawio' ? 'Diagram · draw.io' : w.canvasKind === 'excalidraw' ? 'Diagram · Excalidraw' : 'Flow',
            raw: w
        }));
        const doc = documents.map((d) => ({
            kind: 'document',
            id: d.id,
            title: d.title || 'Untitled document',
            updatedAt: d.updatedAt,
            groupName: getHubGroupNameFromTags(d.tags),
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
    const knownGroupNames = useMemo(() => {
        const names = new Set();
        artifacts.forEach((a) => {
            const n = (a.groupName || '').trim();
            if (n) names.add(n);
        });
        return Array.from(names).sort((a, b) => a.localeCompare(b));
    }, [artifacts]);
    const groupedLibrary = useMemo(() => {
        const map = new Map();
        artifacts.forEach((a) => {
            const name = (a.groupName || '').trim() || 'Ungrouped';
            if (!map.has(name)) map.set(name, []);
            map.get(name).push(a);
        });
        return Array.from(map.entries())
            .sort((a, b) => {
                if (a[0] === 'Ungrouped') return 1;
                if (b[0] === 'Ungrouped') return -1;
                return a[0].localeCompare(b[0]);
            })
            .map(([name, items]) => ({
                name,
                items: items.sort((x, y) => new Date(y.updatedAt) - new Date(x.updatedAt))
            }));
    }, [artifacts]);

    const assignSelectedToGroup = useCallback(async () => {
        if (!selected) return;
        const suggestion = knownGroupNames.length ? `\nExisting: ${knownGroupNames.join(', ')}` : '';
        const input = window.prompt(`Enter group name for this item.${suggestion}\n(Leave blank to remove group)`, selected.groupName || '');
        if (input == null) return;
        const nextGroup = input.trim();
        try {
            if (selected.kind === 'workflow' && ds?.updateTeamWorkflow) {
                await ds.updateTeamWorkflow(selected.id, { tags: withHubGroupTag(selected.raw?.tags, nextGroup) });
            } else if (selected.kind === 'document' && ds?.updateTeamDocument) {
                await ds.updateTeamDocument(selected.id, { tags: withHubGroupTag(selected.raw?.tags, nextGroup) });
            }
            await loadAll(true);
        } catch (e) {
            window.alert(e.message || 'Could not update group');
        }
    }, [selected, knownGroupNames, ds, loadAll]);

    useEffect(() => {
        if (selectedWorkflow) setWorkflowTitleEdit(selectedWorkflow.title || '');
    }, [selectedWorkflow?.id, selectedWorkflow?.title]);

    const setLibraryCollapsedPersist = useCallback((next) => {
        setLibraryCollapsed(next);
        try {
            localStorage.setItem('team_process_hub_library_collapsed', next ? '1' : '0');
            sessionStorage.setItem('team_process_hub_library_collapsed', next ? '1' : '0');
        } catch (_) {}
    }, []);

    const commitListRename = useCallback(async () => {
        if (skipListRenameBlurRef.current) {
            skipListRenameBlurRef.current = false;
            return;
        }
        if (!renameTarget) return;
        const t = renameDraft.trim();
        if (!t) {
            setRenameTarget(null);
            return;
        }
        const { kind, id } = renameTarget;
        try {
            if (kind === 'workflow' && ds?.updateTeamWorkflow) {
                await ds.updateTeamWorkflow(id, { title: t });
            } else if (kind === 'document' && ds?.updateTeamDocument) {
                await ds.updateTeamDocument(id, { title: t });
            }
            await loadAll(true);
            setSelected((s) =>
                s && s.kind === kind && s.id === id ? { ...s, title: t, raw: { ...s.raw, title: t } } : s
            );
            if (selectedWorkflow?.id === id) setWorkflowTitleEdit(t);
        } catch (e) {
            window.alert(e.message || 'Could not rename');
        } finally {
            setRenameTarget(null);
        }
    }, [renameTarget, renameDraft, ds, loadAll, selectedWorkflow?.id]);

    const startListRename = useCallback((e, a) => {
        e.stopPropagation();
        setRenameTarget({ kind: a.kind, id: a.id });
        setRenameDraft(a.title || '');
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
            try {
                await ds.updateTeamWorkflow(id, patch);
                await loadAll(true);
            } catch (e) {
                console.error(e);
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
            if (warns.length) {
                const popplerMissing =
                    meta?.converter === 'none' && warns.some((x) => /pdftocairo|Poppler|poppler/i.test(x));
                setHubBanner(
                    popplerMissing
                        ? {
                              variant: 'info',
                              message:
                                  'Sketch mode needs Poppler (pdftocairo) on the server for vector shapes. An empty or partial diagram may have been created. Use Trace mode for a dim PDF background that works without server tools, or ask your admin to install: sudo apt-get install -y poppler-utils'
                          }
                        : { variant: 'warn', message: warns.join('\n') }
                );
            }
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
                setHubBanner(null);
                setPdfImportChoice({ file: files[0] });
                return;
            }
        }

        setHubBanner(null);

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
                    if (warns.length) setHubBanner({ variant: 'warn', message: warns.join('\n') });
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
    let animationCursor = 0;

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

            {hubBanner && (
                <div
                    className={`mx-4 mb-2 rounded-xl border px-3 py-2.5 flex gap-3 items-start ${
                        hubBanner.variant === 'info'
                            ? isDark
                                ? 'border-cyan-800/80 bg-cyan-950/35 text-cyan-100'
                                : 'border-sky-200 bg-sky-50 text-sky-950'
                            : isDark
                              ? 'border-amber-800/80 bg-amber-950/30 text-amber-100'
                              : 'border-amber-200 bg-amber-50 text-amber-950'
                    }`}
                    role="status"
                >
                    <p className="text-sm whitespace-pre-wrap flex-1 leading-snug">{hubBanner.message}</p>
                    <button
                        type="button"
                        onClick={() => setHubBanner(null)}
                        className={`shrink-0 text-lg leading-none px-1 rounded hover:opacity-80 ${
                            hubBanner.variant === 'info'
                                ? isDark
                                    ? 'text-cyan-300'
                                    : 'text-sky-800'
                                : isDark
                                  ? 'text-amber-300'
                                  : 'text-amber-900'
                        }`}
                        aria-label="Dismiss"
                    >
                        ×
                    </button>
                </div>
            )}

            <div className="flex min-h-[520px] relative">
                {!libraryCollapsed && (
                <div style={{ width: leftWidth, minWidth: 260, maxWidth: 560 }} className={`flex flex-col border-r ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
                    <div className={`flex items-center justify-between gap-2 px-3 py-2 border-b ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
                        <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                            Library
                        </span>
                        <button
                            type="button"
                            onClick={() => setLibraryCollapsedPersist(true)}
                            title="Hide library"
                            aria-label="Hide library"
                            className={`shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                                isDark
                                    ? 'border-gray-700 text-gray-300 hover:bg-gray-900 hover:border-cyan-800'
                                    : 'border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-sky-400'
                            }`}
                        >
                            <i className="fas fa-chevron-left text-sm" aria-hidden />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-2">
                        {loading && (
                            <div className={`flex items-center justify-center py-12 text-sm ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                                <span className="animate-spin mr-2 inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full" />
                                Loading…
                            </div>
                        )}
                        {!loading &&
                            groupedLibrary.map((group) => (
                                <div key={`hub-group-${group.name}`} className="space-y-2">
                                    <div
                                        className={`px-2 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider ${
                                            isDark ? 'text-cyan-300/80' : 'text-sky-800/80'
                                        }`}
                                    >
                                        {group.name} <span className={`${isDark ? 'text-gray-500' : 'text-gray-500'}`}>({group.items.length})</span>
                                    </div>
                                    {group.items.map((a) => {
                                        const idx = animationCursor++;
                                        const active = selected?.kind === a.kind && selected?.id === a.id;
                                        const delay = prefersReducedMotion ? '0ms' : `${idx * 42}ms`;
                                        const isRenaming = renameTarget && renameTarget.kind === a.kind && renameTarget.id === a.id;
                                        return (
                                            <div
                                                key={`${a.kind}-${a.id}`}
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => setSelected(a)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        setSelected(a);
                                                    }
                                                }}
                                                style={{ animationDelay: delay }}
                                                className={`w-full text-left rounded-xl border px-3 py-3 transition-all duration-200 relative overflow-hidden group cursor-pointer ${
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
                                                        <div className="flex items-center gap-1.5 min-w-0">
                                                            {isRenaming ? (
                                                                <input
                                                                    autoFocus
                                                                    value={renameDraft}
                                                                    onChange={(e) => setRenameDraft(e.target.value)}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    onBlur={() => void commitListRename()}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') {
                                                                            e.preventDefault();
                                                                            void commitListRename();
                                                                        }
                                                                        if (e.key === 'Escape') {
                                                                            e.preventDefault();
                                                                            skipListRenameBlurRef.current = true;
                                                                            setRenameTarget(null);
                                                                        }
                                                                    }}
                                                                    className={`min-w-0 flex-1 rounded-md border px-2 py-1 text-sm font-medium outline-none focus:ring-2 focus:ring-cyan-500/40 ${
                                                                        isDark
                                                                            ? 'border-gray-600 bg-gray-950 text-gray-100'
                                                                            : 'border-gray-300 bg-white text-gray-900'
                                                                    }`}
                                                                    aria-label={a.kind === 'workflow' ? 'Process name' : 'Document title'}
                                                                />
                                                            ) : (
                                                                <>
                                                                    <div
                                                                        className={`font-medium truncate flex-1 min-w-0 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}
                                                                        onDoubleClick={(e) => startListRename(e, a)}
                                                                    >
                                                                        {a.title}
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => startListRename(e, a)}
                                                                        title={a.kind === 'workflow' ? 'Rename process' : 'Rename document'}
                                                                        aria-label={a.kind === 'workflow' ? 'Rename process' : 'Rename document'}
                                                                        className={`shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md border transition-opacity opacity-70 hover:opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 ${
                                                                            isDark
                                                                                ? 'border-gray-700 text-gray-400 hover:text-cyan-300'
                                                                                : 'border-gray-300 text-gray-500 hover:text-sky-700'
                                                                        }`}
                                                                    >
                                                                        <i className="fas fa-pen text-xs" aria-hidden />
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                        <div className={`text-xs mt-0.5 font-mono ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>{a.sub}</div>
                                                        <div className={`text-[10px] mt-1 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                                                            {new Date(a.updatedAt).toLocaleString()}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
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
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        e.currentTarget.blur();
                                    }
                                }}
                                onBlur={async () => {
                                    if (!selectedWorkflow?.id || !ds?.updateTeamWorkflow) return;
                                    const t = workflowTitleEdit.trim();
                                    if (!t || t === (selectedWorkflow.title || '')) return;
                                    try {
                                        await ds.updateTeamWorkflow(selectedWorkflow.id, { title: t });
                                        await loadAll(true);
                                        setSelected((s) =>
                                            s?.kind === 'workflow' && s.id === selectedWorkflow.id
                                                ? { ...s, title: t, raw: { ...s.raw, title: t } }
                                                : s
                                        );
                                    } catch (e) {
                                        window.alert(e.message || 'Could not save title');
                                    }
                                }}
                                className={`flex-1 min-w-[160px] text-lg font-semibold bg-transparent border-b border-transparent focus:border-cyan-500 outline-none ${
                                    isDark ? 'text-white placeholder:text-gray-600' : 'text-gray-900 placeholder:text-gray-400'
                                }`}
                                placeholder="Process name"
                                aria-label="Process name"
                            />
                            <button
                                type="button"
                                onClick={assignSelectedToGroup}
                                className={`text-sm px-3 py-1.5 rounded-lg border shrink-0 ${
                                    isDark ? 'border-cyan-900 text-cyan-300 hover:bg-cyan-950/40' : 'border-sky-200 text-sky-700 hover:bg-sky-50'
                                }`}
                            >
                                Group
                            </button>
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
                            teamId={team?.id}
                            isDark={isDark}
                            onAssignGroup={assignSelectedToGroup}
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

function genThreadId() {
    return `thr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function genMessageId() {
    return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function parseContentThreadsRaw(raw) {
    if (Array.isArray(raw)) {
        return raw.filter((t) => t && typeof t === 'object' && typeof t.id === 'string');
    }
    if (typeof raw === 'string') {
        try {
            const p = JSON.parse(raw || '[]');
            return Array.isArray(p) ? p.filter((t) => t && typeof t === 'object' && typeof t.id === 'string') : [];
        } catch (_) {
            return [];
        }
    }
    return [];
}

function reconcileThreadsWithContent(threads, content) {
    const text = String(content || '');
    return threads.map((t) => {
        const quote = String(t.quote || '');
        let start = Number(t.start);
        let end = Number(t.end);
        if (Number.isNaN(start)) start = 0;
        if (Number.isNaN(end)) end = 0;
        if (quote && text.slice(start, end) === quote) {
            return { ...t, start, end, anchorStale: false };
        }
        if (quote) {
            const idx = text.indexOf(quote);
            if (idx !== -1) {
                return { ...t, start: idx, end: idx + quote.length, anchorStale: false };
            }
        }
        return { ...t, start, end, anchorStale: true };
    });
}

function buildTeamProcessHubDocLink(teamId, documentId) {
    try {
        const base = `${window.location.origin}${window.location.pathname || '/'}`;
        const search = window.location.search || '';
        return `${base}${search}#/teams?tab=process-flows&team=${encodeURIComponent(teamId || '')}&processDoc=${encodeURIComponent(documentId || '')}`;
    } catch (_) {
        return `#/teams?tab=process-flows&team=${encodeURIComponent(teamId || '')}&processDoc=${encodeURIComponent(documentId || '')}`;
    }
}

async function notifyTeamDocumentCommentMentions(commentText, { contextTitle, contextLink, authorName }) {
    if (!commentText?.trim() || !window.MentionHelper?.hasMentions?.(commentText)) return;
    try {
        const token = window.storage?.getToken?.();
        if (!token) return;
        const response = await fetch('/api/users', {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) return;
        const data = await response.json();
        const allUsers = data.data?.users || data.users || [];
        await window.MentionHelper.processMentions(commentText, contextTitle, contextLink, authorName, allUsers);
    } catch (e) {
        console.error('Team document comment mentions:', e);
    }
}

function DocumentDetailPane({ doc, teamId, isDark, onUpdate, onDelete, onAssignGroup }) {
    const [title, setTitle] = useState(doc.title || '');
    const [content, setContent] = useState(doc.content || '');
    const [threads, setThreads] = useState(() => reconcileThreadsWithContent(parseContentThreadsRaw(doc.contentThreads), doc.content || ''));
    const [selectionHint, setSelectionHint] = useState(null);
    const [pendingNewThread, setPendingNewThread] = useState(null);
    const notesRef = useRef(null);

    const safeAttachments = useMemo(() => {
        let list = [];
        if (Array.isArray(doc.attachments)) list = doc.attachments;
        else if (typeof doc.attachments === 'string') {
            try {
                list = JSON.parse(doc.attachments || '[]');
            } catch (_) {
                list = [];
            }
        }
        return Array.isArray(list) ? list : [];
    }, [doc.attachments]);

    const firstPdf = useMemo(
        () => safeAttachments.find((a) => (a.mimeType && a.mimeType.includes('pdf')) || (a.name || '').toLowerCase().endsWith('.pdf')),
        [safeAttachments]
    );

    const [pdfPreviewUrl, setPdfPreviewUrl] = useState('');
    const [pdfPreviewError, setPdfPreviewError] = useState('');
    const [pdfPagePreviews, setPdfPagePreviews] = useState([]);

    useEffect(() => {
        let cancelled = false;
        let objectUrl = '';
        setPdfPreviewUrl('');
        setPdfPreviewError('');
        setPdfPagePreviews([]);

        if (!firstPdf?.url) return undefined;

        (async () => {
            try {
                const token = window.storage?.getToken?.() || localStorage.getItem('abcotronics_token');
                const isSameOrigin = (() => {
                    try {
                        const target = new URL(firstPdf.url, window.location.origin);
                        return target.origin === window.location.origin;
                    } catch (_) {
                        return false;
                    }
                })();
                const response = await fetch(firstPdf.url, {
                    credentials: isSameOrigin ? 'include' : 'omit',
                    headers: token && isSameOrigin ? { Authorization: `Bearer ${token}` } : undefined
                });
                if (!response.ok) throw new Error(`PDF fetch failed (${response.status})`);
                const blob = await response.blob();
                const pdfArrayBuffer = await blob.arrayBuffer();
                objectUrl = URL.createObjectURL(blob);
                if (!cancelled) setPdfPreviewUrl(objectUrl);

                const pdfjsLib = await ensurePdfJs();
                const pdfDoc = await pdfjsLib.getDocument({ data: pdfArrayBuffer }).promise;
                const pageImages = [];
                const maxPages = Math.min(pdfDoc.numPages || 0, 12);
                for (let p = 1; p <= maxPages; p++) {
                    const page = await pdfDoc.getPage(p);
                    const viewport = page.getViewport({ scale: 1.15 });
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    await page.render({ canvasContext: ctx, viewport }).promise;
                    pageImages.push(canvas.toDataURL('image/png'));
                }
                if (!cancelled) setPdfPagePreviews(pageImages);
            } catch (e) {
                if (!cancelled) {
                    setPdfPreviewError(e?.message || 'Could not load inline PDF preview.');
                }
            }
        })();

        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [firstPdf?.url]);

    useEffect(() => {
        setTitle(doc.title || '');
        setContent(doc.content || '');
        setThreads(reconcileThreadsWithContent(parseContentThreadsRaw(doc.contentThreads), doc.content || ''));
        setPendingNewThread(null);
        setSelectionHint(null);
    }, [doc.id, doc.title, doc.content, doc.contentThreads]);

    const threadsView = useMemo(() => reconcileThreadsWithContent(threads, content), [threads, content]);

    const captureSelection = useCallback(() => {
        const el = notesRef.current;
        if (!el) return;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        if (typeof start !== 'number' || typeof end !== 'number' || end <= start) {
            setSelectionHint(null);
            return;
        }
        const quote = String(content || '').slice(start, end);
        if (!quote.trim()) {
            setSelectionHint(null);
            return;
        }
        setSelectionHint({ start, end, quote });
    }, [content]);

    const persistThreads = useCallback(
        async (nextThreads) => {
            setThreads(nextThreads);
            const reconciled = reconcileThreadsWithContent(nextThreads, content);
            const forApi = reconciled.map(({ anchorStale, ...t }) => t);
            await onUpdate({ contentThreads: forApi });
        },
        [content, onUpdate]
    );

    const currentUser = useMemo(() => {
        const u = window.storage?.getUserInfo?.() || {};
        return {
            id: u.id || u.userId || '',
            name: u.name || u.displayName || 'User',
            email: u.email || ''
        };
    }, []);

    const mentionContext = useMemo(
        () => ({
            title: `Team document: ${title || doc.title || 'Untitled'}`,
            link: buildTeamProcessHubDocLink(teamId, doc.id)
        }),
        [title, doc.title, doc.id, teamId]
    );

    const startThreadFromSelection = useCallback(() => {
        if (!selectionHint) return;
        setPendingNewThread(selectionHint);
    }, [selectionHint]);

    const handleSubmitNewThread = useCallback(
        async (commentText) => {
            if (!pendingNewThread || !commentText?.trim()) return;
            const { start, end, quote } = pendingNewThread;
            const msg = {
                id: genMessageId(),
                text: commentText.trim(),
                createdAt: new Date().toISOString(),
                authorId: currentUser.id,
                authorName: currentUser.name,
                authorEmail: currentUser.email
            };
            const next = [
                ...threads,
                {
                    id: genThreadId(),
                    start,
                    end,
                    quote,
                    resolved: false,
                    messages: [msg]
                }
            ];
            await persistThreads(next);
            setPendingNewThread(null);
            setSelectionHint(null);
            void notifyTeamDocumentCommentMentions(commentText.trim(), {
                contextTitle: mentionContext.title,
                contextLink: mentionContext.link,
                authorName: currentUser.name || currentUser.email || 'Someone'
            });
        },
        [pendingNewThread, threads, persistThreads, currentUser, mentionContext]
    );

    const handleReply = useCallback(
        async (threadId, commentText) => {
            if (!commentText?.trim()) return;
            const msg = {
                id: genMessageId(),
                text: commentText.trim(),
                createdAt: new Date().toISOString(),
                authorId: currentUser.id,
                authorName: currentUser.name,
                authorEmail: currentUser.email
            };
            const next = threads.map((t) => (t.id === threadId ? { ...t, messages: [...(t.messages || []), msg] } : t));
            await persistThreads(next);
            void notifyTeamDocumentCommentMentions(commentText.trim(), {
                contextTitle: mentionContext.title,
                contextLink: mentionContext.link,
                authorName: currentUser.name || currentUser.email || 'Someone'
            });
        },
        [threads, persistThreads, currentUser, mentionContext]
    );

    const toggleResolved = useCallback(
        async (threadId, resolved) => {
            const next = threads.map((t) => (t.id === threadId ? { ...t, resolved: !!resolved } : t));
            await persistThreads(next);
        },
        [threads, persistThreads]
    );

    const jumpToThread = useCallback(
        (threadId) => {
            const t = threadsView.find((x) => x.id === threadId);
            const el = notesRef.current;
            if (!t || !el) return;
            el.focus();
            try {
                el.setSelectionRange(t.start, t.end);
            } catch (_) {
                /* ignore */
            }
        },
        [threadsView]
    );

    const CommentInput = typeof window !== 'undefined' && typeof window.CommentInputWithMentions === 'function' ? window.CommentInputWithMentions : null;

    const sortedThreads = useMemo(() => [...threadsView].sort((a, b) => a.start - b.start), [threadsView]);

    return (
        <div className={`flex-1 flex flex-col min-h-0 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
            <div className="flex flex-1 min-h-0 flex-col xl:flex-row gap-4 overflow-hidden p-5">
                <div className={`flex-1 min-w-0 min-h-0 overflow-y-auto space-y-4 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                    <div className="flex justify-between gap-2 flex-wrap items-center">
                        <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            onBlur={() => onUpdate({ title: title.trim() })}
                            className={`text-xl font-semibold bg-transparent border-b border-transparent focus:border-cyan-500 outline-none flex-1 min-w-[200px] ${isDark ? 'text-white' : 'text-gray-900'}`}
                        />
                        <button
                            type="button"
                            onClick={onAssignGroup}
                            className={`text-sm px-3 py-1.5 rounded-lg border ${isDark ? 'border-cyan-900 text-cyan-300 hover:bg-cyan-950/40' : 'border-sky-200 text-sky-700 hover:bg-sky-50'}`}
                        >
                            Group
                        </button>
                        <button
                            type="button"
                            onClick={onDelete}
                            className={`text-sm px-3 py-1.5 rounded-lg border ${isDark ? 'border-red-900 text-red-400' : 'border-red-200 text-red-700'}`}
                        >
                            Delete
                        </button>
                    </div>
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
                            <div className="mt-4">
                                {pdfPreviewError && (
                                    <p className={`text-xs mb-2 ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>
                                        {pdfPreviewError} Use the attachment link above to open it in a new tab.
                                    </p>
                                )}
                                {pdfPagePreviews.length > 0 ? (
                                    <div className={`w-full max-h-[min(70vh,520px)] overflow-auto rounded-xl border p-2 space-y-2 ${isDark ? 'border-gray-700 bg-gray-950/60' : 'border-gray-300 bg-gray-100/70'}`}>
                                        {pdfPagePreviews.map((src, idx) => (
                                            <img
                                                key={`${doc.id}-pdf-page-${idx}`}
                                                src={src}
                                                alt={`PDF page ${idx + 1}`}
                                                className={`w-full rounded-lg border ${isDark ? 'border-gray-800 bg-white' : 'border-gray-200 bg-white'}`}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <object
                                        data={pdfPreviewUrl || firstPdf.url}
                                        type="application/pdf"
                                        className={`w-full h-[min(70vh,520px)] rounded-xl border ${isDark ? 'border-gray-700' : 'border-gray-300'}`}
                                    >
                                        <div className={`text-sm p-3 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                            PDF preview is unavailable in this browser. Open{' '}
                                            <a
                                                href={firstPdf.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={`underline ${isDark ? 'text-cyan-400' : 'text-sky-700'}`}
                                            >
                                                {firstPdf.name || 'the PDF'}
                                            </a>
                                            .
                                        </div>
                                    </object>
                                )}
                            </div>
                        )}
                    </div>
                    <div>
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <h3 className={`text-sm font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Notes</h3>
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={startThreadFromSelection}
                                    disabled={!selectionHint}
                                    className={`text-xs px-2.5 py-1 rounded-lg border font-medium disabled:opacity-40 disabled:cursor-not-allowed ${
                                        isDark ? 'border-cyan-900 text-cyan-200 hover:bg-cyan-950/40' : 'border-sky-200 text-sky-800 hover:bg-sky-50'
                                    }`}
                                >
                                    <i className="fas fa-comment-medical mr-1" aria-hidden="true" />
                                    Comment on selection
                                </button>
                            </div>
                        </div>
                        <p className={`text-[11px] mb-2 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                            Select any text in the notes, then use{' '}
                            <span className={`font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Comment on selection</span> to open a thread. Use{' '}
                            <span className={`font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>@name</span> to tag people.
                        </p>
                        <textarea
                            ref={notesRef}
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            onMouseUp={captureSelection}
                            onKeyUp={captureSelection}
                            onBlur={() => onUpdate({ content })}
                            placeholder="Notes, SOP text, or checklist…"
                            rows={10}
                            className={`w-full rounded-xl border px-3 py-2 text-sm font-sans ${isDark ? 'bg-gray-900 border-gray-700 text-gray-100' : 'bg-white border-gray-300'}`}
                        />
                    </div>
                </div>

                <aside
                    className={`w-full xl:w-[min(100%,380px)] xl:shrink-0 max-h-[55vh] xl:max-h-none min-h-0 overflow-y-auto border-t xl:border-t-0 xl:border-l pt-4 xl:pt-0 xl:pl-4 ${
                        isDark ? 'border-gray-800' : 'border-gray-200'
                    }`}
                >
                    <h3 className={`text-sm font-semibold mb-1 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>Comments on notes</h3>
                    <p className={`text-[11px] mb-3 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                        Threads are saved with this document. If you edit the notes heavily, use{' '}
                        <span className={`font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Jump to text</span> to find the quoted passage.
                    </p>

                    {pendingNewThread && (
                        <div className={`mb-4 rounded-xl border p-3 space-y-2 ${isDark ? 'border-cyan-900/60 bg-cyan-950/20' : 'border-sky-200 bg-sky-50/80'}`}>
                            <div className={`text-xs font-semibold ${isDark ? 'text-cyan-200' : 'text-sky-900'}`}>New thread</div>
                            <blockquote
                                className={`text-xs border-l-2 pl-2 italic max-h-24 overflow-y-auto ${
                                    isDark ? 'border-cyan-700 text-gray-300' : 'border-sky-400 text-gray-700'
                                }`}
                            >
                                {pendingNewThread.quote.length > 400 ? `${pendingNewThread.quote.slice(0, 400)}…` : pendingNewThread.quote}
                            </blockquote>
                            {CommentInput ? (
                                <CommentInput
                                    onSubmit={handleSubmitNewThread}
                                    placeholder="Write a comment… (@mention, Enter to send)"
                                    rows={2}
                                    showButton={true}
                                    autoFocus={true}
                                />
                            ) : (
                                <p className={`text-xs ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>Comment input unavailable — refresh the page.</p>
                            )}
                            <button
                                type="button"
                                onClick={() => setPendingNewThread(null)}
                                className={`text-xs ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
                            >
                                Cancel
                            </button>
                        </div>
                    )}

                    {sortedThreads.length === 0 && !pendingNewThread && (
                        <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>No comment threads yet.</p>
                    )}

                    <ul className="space-y-3">
                        {sortedThreads.map((t) => (
                            <li
                                key={t.id}
                                className={`rounded-xl border p-3 space-y-2 ${isDark ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-white'}`}
                            >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                        {t.anchorStale && (
                                            <span
                                                className={`inline-block text-[10px] font-semibold uppercase tracking-wide mb-1 px-1.5 py-0.5 rounded ${
                                                    isDark ? 'bg-amber-900/50 text-amber-200' : 'bg-amber-100 text-amber-900'
                                                }`}
                                            >
                                                Text moved
                                            </span>
                                        )}
                                        <blockquote
                                            className={`text-xs border-l-2 pl-2 whitespace-pre-wrap break-words max-h-28 overflow-y-auto ${
                                                isDark ? 'border-gray-600 text-gray-300' : 'border-gray-300 text-gray-700'
                                            }`}
                                        >
                                            {(t.quote || '').length > 320 ? `${(t.quote || '').slice(0, 320)}…` : t.quote || '(empty)'}
                                        </blockquote>
                                    </div>
                                    <div className="flex flex-col gap-1 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => jumpToThread(t.id)}
                                            className={`text-[10px] px-2 py-1 rounded border ${isDark ? 'border-gray-600 hover:bg-gray-800' : 'border-gray-300 hover:bg-gray-50'}`}
                                        >
                                            Jump to text
                                        </button>
                                        <label className={`flex items-center gap-1.5 text-[10px] cursor-pointer ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                            <input
                                                type="checkbox"
                                                checked={!!t.resolved}
                                                onChange={(e) => void toggleResolved(t.id, e.target.checked)}
                                            />
                                            Resolved
                                        </label>
                                    </div>
                                </div>
                                <ul className={`space-y-2 text-xs ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                    {(t.messages || []).map((m) => (
                                        <li key={m.id} className={`rounded-lg p-2 ${isDark ? 'bg-black/30' : 'bg-gray-50'}`}>
                                            <div className={`font-medium mb-0.5 ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                                                {m.authorName || 'Someone'}{' '}
                                                <span className={`font-normal ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                                                    · {m.createdAt ? new Date(m.createdAt).toLocaleString() : ''}
                                                </span>
                                            </div>
                                            <div className="whitespace-pre-wrap break-words">{m.text}</div>
                                        </li>
                                    ))}
                                </ul>
                                {CommentInput ? (
                                    <CommentInput
                                        onSubmit={(txt) => void handleReply(t.id, txt)}
                                        placeholder="Reply… (@mention, Enter to send)"
                                        rows={2}
                                        showButton={true}
                                    />
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </aside>
            </div>
        </div>
    );
}

window.TeamProcessHub = TeamProcessHub;
