// Lazy-loaded scripts use a stub `require()` — do not ES-import utils; use window global + fallback.
function sanitizeJobCardStockUsedForSave(stockUsed) {
    if (typeof window !== 'undefined' && typeof window.sanitizeJobCardStockUsedForSave === 'function') {
        return window.sanitizeJobCardStockUsedForSave(stockUsed);
    }
    const rows = Array.isArray(stockUsed) ? stockUsed : [];
    return rows
        .filter((row) => {
            if (!row || typeof row !== 'object') return false;
            const sku = String(row.sku || '').trim();
            const locationId = String(row.locationId || row.location || '').trim();
            const qty = parseFloat(row.quantity);
            return sku && locationId && Number.isFinite(qty) && qty > 0;
        })
        .map((row) => {
            const sku = String(row.sku).trim();
            const locationId = String(row.locationId || row.location).trim();
            const out = {
                sku,
                quantity: parseFloat(row.quantity),
                locationId,
                locationName: String(row.locationName || '').trim(),
                itemName: String(row.itemName || row.name || '').trim(),
                id:
                    row.id != null && String(row.id).trim()
                        ? String(row.id).trim()
                        : `stock-line-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
            };
            if (row.unitCost !== undefined && row.unitCost !== null && row.unitCost !== '') {
                const uc = parseFloat(row.unitCost);
                if (Number.isFinite(uc)) out.unitCost = uc;
            }
            return out;
        });
}

// Get dependencies from window
const { useState, useEffect, useRef, useCallback, useLayoutEffect } = React;
const storage = window.storage;

const JOB_CARD_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const JOB_CARD_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
const HEADING_PREFIX = 'Heading:';

/** Same list as `JOB_CARD_CALL_OUT_CATEGORY_OPTIONS` in jobCardActivityDisplay.js (alphabetical). */
const JOB_CARD_CALL_OUT_CATEGORY_OPTIONS = [
  'Air pump',
  'Calibration',
  'Maintenance',
  'Near Miss',
  'New Install',
  'Nozzle',
  'Observation'
];

const parseJsonArrayField = (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
};

const emptyStockUsedRow = (overrides = {}) => ({
    id: `stock-line-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    sku: '',
    quantity: '',
    locationId: '',
    locationName: '',
    itemName: '',
    unitCost: '',
    ...overrides
});

const parseHeadingFromComments = (rawComments) => {
    if (!rawComments || typeof rawComments !== 'string') return '';
    const headingLine = rawComments
        .split('\n')
        .find((line) => typeof line === 'string' && line.trim().startsWith(HEADING_PREFIX));
    return headingLine ? headingLine.slice(HEADING_PREFIX.length).trim() : '';
};

const mergeHeadingIntoOtherComments = (rawComments, heading) => {
    const withoutHeading = String(rawComments ?? '')
        .split('\n')
        .filter((line) => line && !String(line).trim().startsWith(HEADING_PREFIX));
    const headingLine = heading != null ? String(heading).trim() : '';
    const lines = [...withoutHeading];
    if (headingLine) {
        lines.unshift(`${HEADING_PREFIX} ${headingLine}`);
    }
    return lines.filter(Boolean).join('\n');
};

const parseCustomerSignoffFromOtherComments = (rawComments) => {
    const customer = { name: '', position: '', feedback: '' };
    for (const line of String(rawComments || '').split('\n')) {
        const t = line.trim();
        if (!t) continue;
        if (t.startsWith('Customer:')) customer.name = t.slice('Customer:'.length).trim();
        else if (t.startsWith('Position:')) customer.position = t.slice('Position:'.length).trim();
        else if (t.startsWith('Feedback:')) customer.feedback = t.slice('Feedback:'.length).trim();
    }
    return customer;
};

const stripCustomerSignoffLinesFromComments = (rawComments) => {
    const kept = [];
    for (const line of String(rawComments || '').split('\n')) {
        const t = line.trim();
        if (!t) continue;
        if (
            t.startsWith('Customer:') ||
            t.startsWith('Position:') ||
            t.startsWith('Feedback:') ||
            t.startsWith('Signature:')
        ) {
            continue;
        }
        kept.push(line);
    }
    return kept.join('\n').trim();
};

const extractSignatureDataUrlFromPhotos = (photos) => {
    const arr = parseJsonArrayField(photos);
    const hit = arr.find(
        (p) =>
            p &&
            typeof p === 'object' &&
            p.kind === 'signature' &&
            typeof p.url === 'string' &&
            p.url.trim()
    );
    return hit ? hit.url.trim() : '';
};

function jobCardMediaIsVideoDataUrl(url) {
    return typeof url === 'string' && /^data:video\//i.test(url);
}

function jobCardAnswerRows(answers) {
    if (Array.isArray(answers)) {
        return answers
            .filter((a) => a && (a.fieldId != null || a.field_id != null))
            .map((a) => ({
                fieldId: a.fieldId ?? a.field_id,
                value: a.value != null ? String(a.value) : ''
            }));
    }
    if (answers && typeof answers === 'object') {
        return Object.entries(answers).map(([fieldId, value]) => ({
            fieldId,
            value: value != null ? String(value) : ''
        }));
    }
    return [];
}

function answersObjectFromRows(answers) {
    const o = {};
    jobCardAnswerRows(answers).forEach(({ fieldId, value }) => {
        o[fieldId] = value;
    });
    return o;
}

const isLikelyServerFormInstanceId = (id) =>
    typeof id === 'string' && /^c[a-z0-9]{24}$/i.test(id);

const TERMINAL_JOB_CARD_STATUSES = new Set(['submitted', 'completed', 'ready_for_invoice']);

function normalizeJobCardStatusForModal(status) {
    if (status === undefined || status === null || String(status).trim() === '') return 'draft';
    return String(status).trim().toLowerCase().replace(/\s+/g, '_');
}

/** Require visit reason only when moving into a terminal status from a non-terminal one. */
function jobCardRequiresVisitReasonForSave(priorStatus, targetStatus, reasonForVisit) {
    const prior = normalizeJobCardStatusForModal(priorStatus);
    const target = normalizeJobCardStatusForModal(targetStatus);
    if (!TERMINAL_JOB_CARD_STATUSES.has(target)) return false;
    if (TERMINAL_JOB_CARD_STATUSES.has(prior)) return false;
    return !String(reasonForVisit || '').trim();
}

const VoiceNoteTextarea =
    typeof window !== 'undefined' && window.JobCardVoiceNoteTextarea
        ? window.JobCardVoiceNoteTextarea
        : function VoiceNoteStub(props) {
              const { name, value, onChange, rows = 3, placeholder = '' } = props;
              return (
                  <textarea
                      name={name}
                      value={value}
                      onChange={onChange}
                      rows={rows}
                      placeholder={placeholder}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                  />
              );
          };

const JobCardModal = ({ isOpen, onClose, jobCard, onSave, clients }) => {
    const [formData, setFormData] = useState({
        heading: '',
        agentName: '',
        otherTechnicians: [],
        clientId: '',
        clientName: '',
        siteId: '',
        siteName: '',
        location: '',
        locationLatitude: '',
        locationLongitude: '',
        timeOfDeparture: '',
        timeOfArrival: '',
        vehicleUsed: '',
        kmReadingBefore: '',
        kmReadingAfter: '',
        reasonForVisit: '',
        callOutCategory: '',
        diagnosis: '',
        futureWorkRequired: '',
        futureWorkScheduledAt: '',
        actionsTaken: '',
        stockUsed: [],
        materialsBought: [],
        otherComments: '',
        photos: [],
        serviceForms: [],
        status: 'draft',
        customerName: '',
        customerTitle: '',
        customerFeedback: '',
        customerSignDate: '',
        customerSignature: ''
    });
    const [technicianInput, setTechnicianInput] = useState('');
    const [selectedPhotos, setSelectedPhotos] = useState([]);
    const [voiceAttachments, setVoiceAttachments] = useState([]);
    const [availableSites, setAvailableSites] = useState([]);
    const [saving, setSaving] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const submitErrorRef = useRef(null);
    const [formTemplates, setFormTemplates] = useState([]);
    const [loadingTemplates, setLoadingTemplates] = useState(false);
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [loadingServerForms, setLoadingServerForms] = useState(false);
    const [stockLocations, setStockLocations] = useState([]);
    const [inventoryByLocation, setInventoryByLocation] = useState({});
    const loadingInventoryByLocationRef = useRef({});
    /** SKU → master catalog unitCost (loaded from /api/public/inventory, all locations). */
    const masterCostBySkuRef = useRef({});

    const signatureCanvasRef = useRef(null);
    const signatureWrapperRef = useRef(null);
    const isDrawingRef = useRef(false);
    const lastSignatureRestoreRef = useRef(null);
    const [hasSignature, setHasSignature] = useState(false);
    const [signatureLocked, setSignatureLocked] = useState(false);

    const addVoiceClip = useCallback((clip) => {
        setVoiceAttachments((prev) => [
            ...prev,
            {
                ...clip,
                id: `vn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
            }
        ]);
    }, []);

    const updateVoiceClip = useCallback((clipId, patch) => {
        if (!clipId || !patch || typeof patch !== 'object') return;
        setVoiceAttachments((prev) => prev.map((v) => (v.id === clipId ? { ...v, ...patch } : v)));
    }, []);

    // Get current user name for auto-population
    useEffect(() => {
        const userInfo = window.storage?.getUserInfo();
        if (userInfo && !jobCard) {
            setFormData(prev => ({ ...prev, agentName: userInfo.name || '' }));
        }
    }, []);

    useEffect(() => {
        if (jobCard) {
            setSubmitError('');
            const photosRaw = parseJsonArrayField(jobCard.photos);
            const voiceEntries = photosRaw.filter(
                (p) => p && typeof p === 'object' && p.kind === 'voice'
            );
            const visualRaw = photosRaw.filter(
                (p) =>
                    !p ||
                    typeof p !== 'object' ||
                    (p.kind !== 'voice' && p.kind !== 'signature')
            );
            const visualUrls = visualRaw
                .map((p) => (typeof p === 'string' ? p : p && p.url))
                .filter(Boolean);
            const parsedCustomer = parseCustomerSignoffFromOtherComments(jobCard.otherComments || '');
            const savedSignature =
                (typeof jobCard.customerSignature === 'string' && jobCard.customerSignature.trim()) ||
                extractSignatureDataUrlFromPhotos(jobCard.photos) ||
                '';
            const technicianComments = stripCustomerSignoffLinesFromComments(jobCard.otherComments || '');

            setVoiceAttachments(
                voiceEntries.map((v, i) => ({
                    id: `vn_restore_${i}_${Date.now()}`,
                    section: v.section || 'otherComments',
                    dataUrl: v.url || v.dataUrl || '',
                    mimeType: v.mimeType || 'audio/webm',
                    noteNumber: i + 1
                }))
            );

            setFormData({
                heading: jobCard.heading || parseHeadingFromComments(jobCard.otherComments || ''),
                agentName: jobCard.agentName || '',
                otherTechnicians: parseJsonArrayField(jobCard.otherTechnicians),
                clientId: jobCard.clientId || '',
                clientName: jobCard.clientName || '',
                siteId: jobCard.siteId || '',
                siteName: jobCard.siteName || '',
                location: jobCard.location || '',
                locationLatitude: jobCard.locationLatitude != null ? String(jobCard.locationLatitude) : '',
                locationLongitude: jobCard.locationLongitude != null ? String(jobCard.locationLongitude) : '',
                timeOfDeparture: jobCard.timeOfDeparture ? jobCard.timeOfDeparture.substring(0, 16) : '',
                timeOfArrival: jobCard.timeOfArrival ? jobCard.timeOfArrival.substring(0, 16) : '',
                vehicleUsed: jobCard.vehicleUsed || '',
                kmReadingBefore: jobCard.kmReadingBefore ?? '',
                kmReadingAfter: jobCard.kmReadingAfter ?? '',
                reasonForVisit: jobCard.reasonForVisit || '',
                callOutCategory: jobCard.callOutCategory || '',
                diagnosis: jobCard.diagnosis || '',
                futureWorkRequired: jobCard.futureWorkRequired || '',
                futureWorkScheduledAt: jobCard.futureWorkScheduledAt
                    ? String(jobCard.futureWorkScheduledAt).substring(0, 16)
                    : '',
                actionsTaken: jobCard.actionsTaken || '',
                stockUsed: parseJsonArrayField(jobCard.stockUsed),
                materialsBought: parseJsonArrayField(jobCard.materialsBought),
                otherComments: technicianComments,
                photos: visualUrls,
                serviceForms: [],
                status: jobCard.status || 'draft',
                customerName: jobCard.customerName || parsedCustomer.name || '',
                customerTitle: jobCard.customerTitle || parsedCustomer.position || '',
                customerFeedback: jobCard.customerFeedback || parsedCustomer.feedback || '',
                customerSignDate: jobCard.customerSignDate
                    ? String(jobCard.customerSignDate).slice(0, 10)
                    : '',
                customerSignature: savedSignature
            });
            setSelectedPhotos(
                visualUrls.map((url, i) => ({
                    name: `Attachment ${i + 1}`,
                    url
                }))
            );
            setHasSignature(Boolean(savedSignature));
            setSignatureLocked(Boolean(savedSignature));
            lastSignatureRestoreRef.current = savedSignature || null;
        } else {
            setFormData({
                heading: '',
                agentName: '',
                otherTechnicians: [],
                clientId: '',
                clientName: '',
                siteId: '',
                siteName: '',
                location: '',
                locationLatitude: '',
                locationLongitude: '',
                timeOfDeparture: '',
                timeOfArrival: '',
                vehicleUsed: '',
                kmReadingBefore: '',
                kmReadingAfter: '',
                reasonForVisit: '',
                callOutCategory: '',
                diagnosis: '',
                futureWorkRequired: '',
                futureWorkScheduledAt: '',
                actionsTaken: '',
                stockUsed: [],
                materialsBought: [],
                otherComments: '',
                photos: [],
                serviceForms: [],
                status: 'draft',
                customerName: '',
                customerTitle: '',
                customerFeedback: '',
                customerSignDate: '',
                customerSignature: ''
            });
            setSelectedPhotos([]);
            setVoiceAttachments([]);
            setHasSignature(false);
            setSignatureLocked(false);
            lastSignatureRestoreRef.current = null;
        }
    }, [jobCard]);

    useEffect(() => {
        if (!isOpen || !jobCard?.id) return;
        let cancelled = false;
        setLoadingServerForms(true);
        const token = window.storage?.getToken?.();
        if (!token) {
            setLoadingServerForms(false);
            return;
        }
        (async () => {
            try {
                const res = await fetch(`/api/jobcards/${encodeURIComponent(jobCard.id)}/forms`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (!res.ok || cancelled) return;
                const data = await res.json();
                const inner = data.data != null ? data.data : data;
                const forms = Array.isArray(inner?.forms) ? inner.forms : [];
                if (cancelled) return;
                setFormData((prev) => ({
                    ...prev,
                    serviceForms: forms.map((f) => ({
                        id: f.id,
                        templateId: f.templateId,
                        templateName: f.templateName || '',
                        templateVersion: f.templateVersion || 1,
                        answers: answersObjectFromRows(f.answers),
                        templateFields: Array.isArray(f.templateFields) ? f.templateFields : []
                    }))
                }));
            } catch (e) {
                console.warn('JobCardModal: could not load service forms', e);
            } finally {
                if (!cancelled) setLoadingServerForms(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isOpen, jobCard?.id]);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        setLoadingTemplates(true);
        const token = window.storage?.getToken?.();
        (async () => {
            try {
                const headers = token ? { Authorization: `Bearer ${token}` } : {};
                const res = await fetch('/api/service-forms', { headers });
                if (!res.ok || cancelled) return;
                const data = await res.json();
                const inner = data.data != null ? data.data : data;
                const templates = Array.isArray(inner?.templates) ? inner.templates : [];
                if (!cancelled) setFormTemplates(templates);
            } catch (e) {
                console.warn('JobCardModal: templates load failed', e);
            } finally {
                if (!cancelled) setLoadingTemplates(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isOpen]);

    // Load stock locations (for "Stock used" location dropdown) when modal opens.
    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        const token = window.storage?.getToken?.();
        (async () => {
            try {
                const res = await fetch('/api/public/locations', {
                    headers: token ? { Authorization: `Bearer ${token}` } : {}
                });
                if (!res.ok || cancelled) return;
                const data = await res.json();
                const inner = data?.data != null ? data.data : data;
                const locs = Array.isArray(inner?.locations) ? inner.locations : [];
                if (!cancelled) {
                    setStockLocations(
                        locs.filter((l) => l && l.status !== 'inactive' && l.status !== 'suspended')
                    );
                }
            } catch (e) {
                console.warn('JobCardModal: stock locations load failed', e);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isOpen]);

    /**
     * Lazy-load inventory rows for a stock location (used to populate the SKU dropdown
     * for one stock-used row). Cached per-location so switching between rows is fast.
     */
    const ensureInventoryForLocation = useCallback(async (locId) => {
        if (!locId) return;
        if (loadingInventoryByLocationRef.current[locId]) return;
        let alreadyLoaded = false;
        setInventoryByLocation((prev) => {
            if (Array.isArray(prev[locId])) {
                alreadyLoaded = true;
            }
            return prev;
        });
        if (alreadyLoaded) return;
        loadingInventoryByLocationRef.current[locId] = true;
        const token = window.storage?.getToken?.();
        try {
            const res = await fetch(
                `/api/public/inventory?locationId=${encodeURIComponent(locId)}`,
                { headers: token ? { Authorization: `Bearer ${token}` } : {} }
            );
            let rows = [];
            if (res.ok) {
                const data = await res.json();
                const inner = data?.data != null ? data.data : data;
                rows = Array.isArray(inner?.inventory) ? inner.inventory : [];
            }
            setInventoryByLocation((prev) => ({ ...prev, [locId]: rows }));
        } catch (e) {
            console.warn('JobCardModal: inventory fetch failed for', locId, e);
            setInventoryByLocation((prev) => ({ ...prev, [locId]: [] }));
        } finally {
            loadingInventoryByLocationRef.current[locId] = false;
        }
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        (async () => {
            const token = window.storage?.getToken?.();
            try {
                const res = await fetch('/api/public/inventory', {
                    headers: token ? { Authorization: `Bearer ${token}` } : {}
                });
                if (!res.ok || cancelled) return;
                const data = await res.json();
                const inner = data?.data != null ? data.data : data;
                const rows = Array.isArray(inner?.inventory) ? inner.inventory : [];
                const map = {};
                for (const row of rows) {
                    if (row?.sku) map[String(row.sku)] = Number(row.unitCost) || 0;
                }
                masterCostBySkuRef.current = map;
            } catch (e) {
                console.warn('JobCardModal: master inventory cost fetch failed', e);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isOpen]);

    // Pre-fetch inventory for any locations already referenced by existing stock rows
    // so the SKU dropdowns can show the saved selections on edit.
    useEffect(() => {
        if (!isOpen) return;
        const locIds = new Set();
        (formData.stockUsed || []).forEach((row) => {
            if (row && row.locationId) locIds.add(String(row.locationId));
        });
        locIds.forEach((id) => {
            void ensureInventoryForLocation(id);
        });
    }, [isOpen, formData.stockUsed, ensureInventoryForLocation]);

    // Show one empty stock line when the modal opens with no stock (same as mobile wizard).
    useEffect(() => {
        if (!isOpen) return;
        setFormData((prev) => {
            if ((prev.stockUsed || []).length > 0) return prev;
            return { ...prev, stockUsed: [emptyStockUsedRow()] };
        });
    }, [isOpen, jobCard?.id]);

    // Load sites when client changes
    useEffect(() => {
        if (formData.clientId && clients) {
            const client = clients.find(c => c.id === formData.clientId);
            if (client) {
                const sites = typeof client.sites === 'string' ? JSON.parse(client.sites || '[]') : (client.sites || []);
                setAvailableSites(sites);
                setFormData(prev => ({ ...prev, clientName: client.name || '' }));
            }
        } else {
            setAvailableSites([]);
            setFormData(prev => ({ ...prev, siteId: '', siteName: '' }));
        }
    }, [formData.clientId]);

    // Set site name when site changes
    useEffect(() => {
        if (formData.siteId && availableSites.length > 0) {
            const site = availableSites.find(s => s.id === formData.siteId);
            if (site) {
                setFormData(prev => ({ ...prev, siteName: site.name || '' }));
            }
        }
    }, [formData.siteId]);

    const resizeSignatureCanvas = useCallback(() => {
        const canvas = signatureCanvasRef.current;
        const wrapper = signatureWrapperRef.current;
        if (!canvas || !wrapper) return;
        const ratio = window.devicePixelRatio || 1;
        const width = wrapper.clientWidth;
        const height = 180;
        canvas.width = width * ratio;
        canvas.height = height * ratio;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        const ctx = canvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(ratio, ratio);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#111827';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
    }, []);

    const restoreSignatureToCanvas = useCallback(
        (dataUrl) => {
            const canvas = signatureCanvasRef.current;
            if (!canvas || !dataUrl || !String(dataUrl).startsWith('data:image')) return;
            if (lastSignatureRestoreRef.current === dataUrl) return;
            const img = new Image();
            img.onload = () => {
                if (lastSignatureRestoreRef.current === dataUrl) return;
                resizeSignatureCanvas();
                const ctx = canvas.getContext('2d');
                const ratio = window.devicePixelRatio || 1;
                const w = canvas.width / ratio;
                const h = canvas.height / ratio;
                ctx.drawImage(img, 0, 0, w, h);
                setHasSignature(true);
                lastSignatureRestoreRef.current = dataUrl;
            };
            img.src = dataUrl;
        },
        [resizeSignatureCanvas]
    );

    const getSignaturePosition = useCallback((event) => {
        const canvas = signatureCanvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const pointer = event.touches ? event.touches[0] : event;
        return {
            x: pointer.clientX - rect.left,
            y: pointer.clientY - rect.top
        };
    }, []);

    const startSignature = useCallback(
        (event) => {
            if (signatureLocked) return;
            const canvas = signatureCanvasRef.current;
            if (!canvas) return;
            isDrawingRef.current = true;
            const ctx = canvas.getContext('2d');
            const { x, y } = getSignaturePosition(event);
            ctx.beginPath();
            ctx.moveTo(x, y);
            event.preventDefault();
        },
        [getSignaturePosition, signatureLocked]
    );

    const drawSignature = useCallback(
        (event) => {
            if (signatureLocked || !isDrawingRef.current) return;
            const canvas = signatureCanvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const { x, y } = getSignaturePosition(event);
            ctx.lineTo(x, y);
            ctx.stroke();
            setHasSignature(true);
            event.preventDefault();
        },
        [getSignaturePosition, signatureLocked]
    );

    const endSignature = useCallback(() => {
        isDrawingRef.current = false;
    }, []);

    const captureSignature = useCallback(() => {
        if (!hasSignature || !signatureCanvasRef.current) return;
        const dataUrl = signatureCanvasRef.current.toDataURL('image/png');
        if (!dataUrl) return;
        setFormData((prev) => ({ ...prev, customerSignature: dataUrl }));
        setSignatureLocked(true);
        lastSignatureRestoreRef.current = dataUrl;
    }, [hasSignature]);

    const clearSignature = useCallback(() => {
        lastSignatureRestoreRef.current = null;
        setFormData((prev) => ({ ...prev, customerSignature: '' }));
        setSignatureLocked(false);
        const canvas = signatureCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        resizeSignatureCanvas();
        setHasSignature(false);
    }, [resizeSignatureCanvas]);

    const exportSignature = useCallback(() => {
        if (signatureLocked && formData.customerSignature) {
            return String(formData.customerSignature).trim();
        }
        if (!hasSignature || !signatureCanvasRef.current) return '';
        return signatureCanvasRef.current.toDataURL('image/png');
    }, [hasSignature, signatureLocked, formData.customerSignature]);

    useLayoutEffect(() => {
        if (!isOpen) return;
        const t = window.setTimeout(() => {
            resizeSignatureCanvas();
            if (signatureLocked && formData.customerSignature) {
                restoreSignatureToCanvas(formData.customerSignature);
            }
        }, 50);
        return () => window.clearTimeout(t);
    }, [isOpen, resizeSignatureCanvas, signatureLocked, formData.customerSignature, restoreSignatureToCanvas]);

    useEffect(() => {
        if (!isOpen) return;
        const sig = formData.customerSignature;
        if (!sig || !String(sig).startsWith('data:image')) return;
        if (!signatureLocked) return;
        const raf = requestAnimationFrame(() => restoreSignatureToCanvas(sig));
        return () => cancelAnimationFrame(raf);
    }, [isOpen, formData.customerSignature, signatureLocked, restoreSignatureToCanvas]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name === 'siteId') {
            const site = availableSites.find(s => s.id === value);
            setFormData(prev => ({
                ...prev,
                siteId: value,
                siteName: site?.name || ''
            }));
            return;
        }
        if (name === 'siteName') {
            setFormData(prev => ({
                ...prev,
                siteName: value,
                siteId: value.trim() ? '' : prev.siteId
            }));
            return;
        }
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleAddTechnician = () => {
        if (technicianInput.trim() && !formData.otherTechnicians.includes(technicianInput.trim())) {
            setFormData(prev => ({
                ...prev,
                otherTechnicians: [...prev.otherTechnicians, technicianInput.trim()]
            }));
            setTechnicianInput('');
        }
    };

    const handleRemoveTechnician = (technician) => {
        setFormData(prev => ({
            ...prev,
            otherTechnicians: prev.otherTechnicians.filter(t => t !== technician)
        }));
    };

    const handlePhotoUpload = (e) => {
        const files = Array.from(e.target.files || []);
        files.forEach((file) => {
            const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/i.test(file.name);
            const maxBytes = isVideo ? JOB_CARD_VIDEO_MAX_BYTES : JOB_CARD_IMAGE_MAX_BYTES;
            if (file.size > maxBytes) {
                alert(
                    isVideo
                        ? `Video "${file.name}" is too large (max ${Math.round(maxBytes / (1024 * 1024))}MB).`
                        : `Image "${file.name}" is too large (max ${Math.round(maxBytes / (1024 * 1024))}MB).`
                );
                return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
                const dataUrl = reader.result;
                setSelectedPhotos((prev) => [...prev, { name: file.name, url: dataUrl, size: file.size }]);
                setFormData((prev) => ({ ...prev, photos: [...(prev.photos || []), dataUrl] }));
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    };

    const ensureServiceFormsArray = (prev) => (Array.isArray(prev.serviceForms) ? prev.serviceForms : []);

    const handleAddForm = (templateId) => {
        const template = formTemplates.find((t) => t.id === templateId);
        if (!template) return;
        setFormData((prev) => {
            const existing = ensureServiceFormsArray(prev);
            if (existing.some((f) => f.templateId === templateId)) {
                alert('This form is already added to the job card.');
                return prev;
            }
            const formId = `form_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            return {
                ...prev,
                serviceForms: [
                    ...existing,
                    {
                        id: formId,
                        templateId: template.id,
                        templateName: template.name,
                        templateVersion: template.version || 1,
                        answers: {},
                        templateFields: Array.isArray(template.fields) ? template.fields : []
                    }
                ]
            };
        });
        setShowTemplateModal(false);
    };

    const handleRemoveForm = (formId) => {
        setFormData((prev) => ({
            ...prev,
            serviceForms: ensureServiceFormsArray(prev).filter((f) => f.id !== formId)
        }));
    };

    const handleFormAnswerChange = (formId, fieldId, value) => {
        setFormData((prev) => {
            const existing = ensureServiceFormsArray(prev);
            return {
                ...prev,
                serviceForms: existing.map((f) => {
                    if (f.id !== formId) return f;
                    return {
                        ...f,
                        answers: { ...(f.answers || {}), [fieldId]: value }
                    };
                })
            };
        });
    };

    const handleRemovePhoto = (index) => {
        const newPhotos = selectedPhotos.filter((_, i) => i !== index);
        setSelectedPhotos(newPhotos);
        setFormData(prev => ({ ...prev, photos: newPhotos.map(p => typeof p === 'string' ? p : p.url) }));
    };

    const addMaterialRow = () => {
        setFormData(prev => ({
            ...prev,
            materialsBought: [...(prev.materialsBought || []), { itemName: '', description: '', reason: '', cost: '' }]
        }));
    };

    const updateMaterialRow = (index, patch) => {
        setFormData(prev => ({
            ...prev,
            materialsBought: (prev.materialsBought || []).map((m, i) => (i === index ? { ...m, ...patch } : m))
        }));
    };

    const removeMaterialRow = (index) => {
        setFormData(prev => ({
            ...prev,
            materialsBought: (prev.materialsBought || []).filter((_, i) => i !== index)
        }));
    };

    /** Add another SKU line; defaults to the last row's location (same bakkie/warehouse). */
    const addStockRow = () => {
        const rows = formData.stockUsed || [];
        const lastWithLoc = [...rows].reverse().find((r) => r && r.locationId);
        const defaultLocId = lastWithLoc?.locationId || '';
        const defaultLocName = lastWithLoc?.locationName || '';
        setFormData((prev) => ({
            ...prev,
            stockUsed: [
                ...(prev.stockUsed || []),
                emptyStockUsedRow({
                    locationId: defaultLocId,
                    locationName: defaultLocName
                })
            ]
        }));
        if (defaultLocId) void ensureInventoryForLocation(defaultLocId);
    };

    /** Add a line at a new stock location (e.g. second bakkie on the same job). */
    const addStockRowAtNewLocation = () => {
        setFormData((prev) => ({
            ...prev,
            stockUsed: [...(prev.stockUsed || []), emptyStockUsedRow()]
        }));
    };

    const updateStockRow = (index, patch) => {
        setFormData(prev => ({
            ...prev,
            stockUsed: (prev.stockUsed || []).map((s, i) => (i === index ? { ...s, ...patch } : s))
        }));
    };

    const handleStockLocationChange = (index, locationId) => {
        const loc = stockLocations.find((l) => String(l.id) === String(locationId));
        updateStockRow(index, {
            locationId: locationId || '',
            locationName: loc?.name || '',
            sku: '',
            itemName: '',
            unitCost: ''
        });
        if (locationId) void ensureInventoryForLocation(locationId);
    };

    const handleStockSkuChange = (index, sku) => {
        const row = (formData.stockUsed || [])[index];
        const locId = row?.locationId || '';
        const items = inventoryByLocation[locId] || [];
        const item = items.find((it) => String(it.sku) === String(sku));
        const skuKey = String(sku || '');
        const masterUc = masterCostBySkuRef.current[skuKey];
        const unitCost =
            masterUc != null && Number.isFinite(masterUc)
                ? masterUc
                : item?.unitCost ?? row?.unitCost ?? '';
        updateStockRow(index, {
            sku: sku || '',
            itemName: item?.name || row?.itemName || '',
            unitCost
        });
    };

    const removeStockRow = (index) => {
        setFormData(prev => ({
            ...prev,
            stockUsed: (prev.stockUsed || []).filter((_, i) => i !== index)
        }));
    };

    const showSubmitError = useCallback((message) => {
        const msg = String(message || '').trim();
        if (!msg) return;
        setSubmitError(msg);
        requestAnimationFrame(() => {
            submitErrorRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
        });
    }, []);

    const handleSubmit = async (e, options = {}) => {
        if (e?.preventDefault) e.preventDefault();
        setSubmitError('');
        const targetStatus = options.forceStatus || formData.status || 'draft';
        const priorStatus = jobCard?.status || 'draft';

        if (!String(formData.agentName || '').trim()) {
            showSubmitError('Agent name is required.');
            return;
        }
        if (!String(formData.clientId || '').trim()) {
            showSubmitError('Please select a client.');
            return;
        }

        if (
            jobCardRequiresVisitReasonForSave(
                priorStatus,
                targetStatus,
                formData.reasonForVisit
            )
        ) {
            showSubmitError(
                'Enter a reason for the visit before changing status to Submitted or Completed.'
            );
            return;
        }

        // If marking as completed, ensure all attached service forms are completed
        if (jobCard && targetStatus === 'completed') {
            try {
                const token = window.storage?.getToken?.();
                if (token && jobCard.id) {
                    const res = await fetch(`/api/jobcards/${encodeURIComponent(jobCard.id)}/forms`, {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        const inner = data.data != null ? data.data : data;
                        const forms = Array.isArray(inner?.forms) ? inner.forms : [];
                        const incomplete = forms.filter(
                            (f) => (f.status || '').toString().toLowerCase() !== 'completed'
                        );
                        if (forms.length > 0 && incomplete.length > 0) {
                            showSubmitError(
                                'Complete all attached service forms/checklists before marking this job card as Completed.'
                            );
                            return;
                        }
                    }
                }
            } catch (error) {
                console.warn('JobCardModal: Failed to verify service forms before completion', error);
                // If verification fails, allow completion to avoid blocking users unexpectedly
            }
        }

        try {
            setSaving(true);

            const materialsBought = (formData.materialsBought || [])
                .filter(
                    m =>
                        (m.itemName && String(m.itemName).trim()) ||
                        (m.cost !== '' && m.cost != null && !Number.isNaN(parseFloat(m.cost)))
                )
                .map(m => ({
                    itemName: String(m.itemName || '').trim(),
                    description: String(m.description || '').trim(),
                    reason: String(m.reason || '').trim(),
                    cost: parseFloat(m.cost) || 0
                }));

            const stockUsed = sanitizeJobCardStockUsedForSave(formData.stockUsed).map(s => {
                    const locId = String(s.locationId || '').trim();
                    const locName =
                        String(s.locationName || '').trim() ||
                        stockLocations.find((l) => String(l.id) === locId)?.name ||
                        '';
                    const skuKey = String(s.sku || '').trim();
                    const row = {
                        sku: skuKey,
                        quantity: parseFloat(s.quantity) || 0,
                        locationId: locId,
                        locationName: locName,
                        itemName: String(s.itemName || '').trim()
                    };
                    const masterUc = masterCostBySkuRef.current[skuKey];
                    if (masterUc != null && Number.isFinite(masterUc)) {
                        row.unitCost = masterUc;
                    } else if (s.unitCost !== '' && s.unitCost != null && !Number.isNaN(parseFloat(s.unitCost))) {
                        row.unitCost = parseFloat(s.unitCost);
                    }
                    return row;
                });

            const totalMaterialsCost = materialsBought.reduce((sum, m) => sum + (parseFloat(m.cost) || 0), 0);

            const visualUrls = selectedPhotos.map((p) => (typeof p === 'string' ? p : p.url));
            const voicePhotoEntries = voiceAttachments.map((v) => ({
                kind: 'voice',
                section: v.section,
                url: v.dataUrl,
                mimeType: v.mimeType || 'audio/webm'
            }));
            const sigDataUrl =
                exportSignature() ||
                (typeof formData.customerSignature === 'string' ? formData.customerSignature.trim() : '');
            const signatureObjects = sigDataUrl ? [{ kind: 'signature', url: sigDataUrl }] : [];

            const { serviceForms: _sf, ...formWithoutForms } = formData;
            const nowIso = new Date().toISOString();
            const startedAtSeed = jobCard?.startedAt || jobCard?.createdAt || nowIso;
            const headingLine = String(formData.heading || '').trim();
            const otherCommentsForSave = mergeHeadingIntoOtherComments(
                formData.otherComments || '',
                headingLine
            );

            const jobCardData = {
                ...formWithoutForms,
                status: targetStatus,
                materialsBought,
                stockUsed,
                totalMaterialsCost,
                locationLatitude: formData.locationLatitude != null ? String(formData.locationLatitude) : '',
                locationLongitude: formData.locationLongitude != null ? String(formData.locationLongitude) : '',
                photos: [...visualUrls, ...voicePhotoEntries, ...signatureObjects],
                customerSignature: sigDataUrl || '',
                otherComments: otherCommentsForSave,
                heading: headingLine,
                id: jobCard?.id || Date.now().toString(),
                startedAt: startedAtSeed,
                createdAt: jobCard?.createdAt || startedAtSeed,
                updatedAt: nowIso,
                submittedAt:
                    targetStatus === 'submitted' || targetStatus === 'completed'
                        ? (jobCard?.submittedAt || nowIso)
                        : null
            };

            const saveResult = await onSave(jobCardData);
            if (saveResult && saveResult.ok === false) {
                showSubmitError(saveResult.error || 'Failed to save job card.');
                return;
            }
            const resolvedId =
                (saveResult && typeof saveResult === 'object' && saveResult.id) || jobCard?.id || null;

            if (resolvedId && ensureServiceFormsArray(formData).length > 0) {
                const token = window.storage?.getToken?.();
                if (token) {
                    for (const form of ensureServiceFormsArray(formData)) {
                        const answersArr = Object.entries(form.answers || {}).map(([fieldId, value]) => ({
                            fieldId,
                            value: String(value ?? '')
                        }));
                        const completed = answersArr.length > 0 ? 'completed' : 'not_started';
                        try {
                            if (isLikelyServerFormInstanceId(form.id)) {
                                await fetch(
                                    `/api/jobcards/${encodeURIComponent(resolvedId)}/forms/${encodeURIComponent(form.id)}`,
                                    {
                                        method: 'PATCH',
                                        headers: {
                                            Authorization: `Bearer ${token}`,
                                            'Content-Type': 'application/json'
                                        },
                                        body: JSON.stringify({ answers: answersArr, status: completed })
                                    }
                                );
                            } else {
                                await fetch(`/api/jobcards/${encodeURIComponent(resolvedId)}/forms`, {
                                    method: 'POST',
                                    headers: {
                                        Authorization: `Bearer ${token}`,
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({
                                        templateId: form.templateId,
                                        answers: answersArr,
                                        status: completed
                                    })
                                });
                            }
                        } catch (err) {
                            console.warn('JobCardModal: checklist sync failed', err);
                        }
                    }
                }
            }

            onClose();
        } catch (error) {
            console.error('JobCardModal: save failed', error);
            showSubmitError(error?.message || 'Failed to save job card.');
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4">
            <div className="modal-panel relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800">
                <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 py-3 dark:border-slate-700 dark:from-slate-900 dark:to-slate-800 sm:px-5">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
                            {jobCard ? 'Edit Job Card' : 'New Job Card'}
                        </h3>
                        <p className="text-xs text-gray-600 dark:text-slate-400">
                            Classic capture — same fields as the mobile job card wizard
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition dark:text-slate-400 dark:hover:text-slate-200"
                    >
                        <i className="fas fa-times text-lg"></i>
                    </button>
                </div>

                <form
                    noValidate
                    onSubmit={handleSubmit}
                    className="flex min-h-0 flex-1 flex-col overflow-hidden"
                >
                    <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
                    {submitError ? (
                        <div
                            ref={submitErrorRef}
                            role="alert"
                            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200"
                        >
                            <i className="fas fa-exclamation-circle mr-2" aria-hidden />
                            {submitError}
                        </div>
                    ) : null}
                    {/* Agent Name - Auto-populated */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                            Agent Name *
                        </label>
                        <input
                            type="text"
                            name="agentName"
                            value={formData.agentName}
                            onChange={handleChange}
                            required
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            placeholder="Name of agent filling out this form"
                        />
                    </div>

                    {/* Other Technicians */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                            Other Technicians
                        </label>
                        <div className="flex gap-2 mb-2">
                            <input
                                type="text"
                                value={technicianInput}
                                onChange={(e) => setTechnicianInput(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTechnician())}
                                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                                placeholder="Add technician name"
                            />
                            <button
                                type="button"
                                onClick={handleAddTechnician}
                                className="px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition text-sm"
                            >
                                <i className="fas fa-plus"></i>
                            </button>
                        </div>
                        {formData.otherTechnicians.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {formData.otherTechnicians.map((technician, idx) => (
                                    <span key={idx} className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs dark:bg-blue-900 dark:text-blue-300">
                                        {technician}
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveTechnician(technician)}
                                            className="hover:text-blue-900 dark:hover:text-blue-100"
                                        >
                                            <i className="fas fa-times"></i>
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Client and Site */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                                Client *
                            </label>
                            <select
                                name="clientId"
                                value={formData.clientId}
                                onChange={handleChange}
                                required
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            >
                                <option value="">Select client</option>
                                {clients && clients.filter(c => c.type === 'client').map(client => (
                                    <option key={client.id} value={client.id}>{client.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                                Site
                            </label>
                            {availableSites.length > 0 ? (
                                <select
                                    name="siteId"
                                    value={formData.siteId}
                                    onChange={handleChange}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 mb-2"
                                >
                                    <option value="">Select site (optional)</option>
                                    {availableSites.map(site => (
                                        <option key={site.id} value={site.id}>{site.name}</option>
                                    ))}
                                </select>
                            ) : null}
                            <input
                                type="text"
                                name="siteName"
                                value={formData.siteName}
                                onChange={handleChange}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                                placeholder={availableSites.length ? 'Site name if not listed' : 'Enter site name'}
                            />
                        </div>
                    </div>

                    {/* Location */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                            Location
                        </label>
                        <input
                            type="text"
                            name="location"
                            value={formData.location}
                            onChange={handleChange}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            placeholder="Specific location details"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                            Heading
                        </label>
                        <input
                            type="text"
                            name="heading"
                            value={formData.heading || ''}
                            onChange={handleChange}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            placeholder="Short heading shown with this job card"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                                Latitude (GPS)
                            </label>
                            <input
                                type="text"
                                name="locationLatitude"
                                value={formData.locationLatitude}
                                onChange={handleChange}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                                placeholder="-26.2041"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                                Longitude (GPS)
                            </label>
                            <input
                                type="text"
                                name="locationLongitude"
                                value={formData.locationLongitude}
                                onChange={handleChange}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                                placeholder="28.0473"
                            />
                        </div>
                    </div>

                    {/* Travel & timing */}
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                                Departure time
                            </label>
                            <input
                                type="datetime-local"
                                name="timeOfDeparture"
                                value={formData.timeOfDeparture}
                                onChange={handleChange}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                                Arrival time
                            </label>
                            <input
                                type="datetime-local"
                                name="timeOfArrival"
                                value={formData.timeOfArrival}
                                onChange={handleChange}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                                Total time
                            </label>
                            <div
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-slate-50 text-gray-900 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                                aria-live="polite"
                            >
                                {(() => {
                                    const h = window.jobCardActivityHelpers;
                                    const minutes = h?.travelMinutesFromDatetimeLocals?.(
                                        formData.timeOfDeparture,
                                        formData.timeOfArrival
                                    );
                                    const label = h?.formatTravelDurationMinutes?.(minutes);
                                    return label || '—';
                                })()}
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                            Call Out Category
                        </label>
                        <select
                            name="callOutCategory"
                            value={formData.callOutCategory || ''}
                            onChange={handleChange}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                        >
                            <option value="">Select…</option>
                            {JOB_CARD_CALL_OUT_CATEGORY_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>
                                    {opt}
                                </option>
                            ))}
                        </select>
                    </div>

                    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-600 dark:bg-slate-800/50">
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Visit narrative</h4>
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            Text and optional voice notes per field (same as mobile wizard).
                        </p>
                        <div className="mt-4 space-y-4">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-slate-300">
                                    Reason for call out / visit *
                                </label>
                                <VoiceNoteTextarea
                                    sectionId="reasonForVisit"
                                    name="reasonForVisit"
                                    value={formData.reasonForVisit}
                                    onChange={handleChange}
                                    rows={3}
                                    placeholder="Why was the technician requested on site?"
                                    onVoiceSaved={addVoiceClip}
                                    onVoiceClipUpdate={updateVoiceClip}
                                    voiceClips={voiceAttachments.filter((c) => c.section === 'reasonForVisit')}
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-slate-300">
                                    Diagnosis
                                </label>
                                <VoiceNoteTextarea
                                    sectionId="diagnosis"
                                    name="diagnosis"
                                    value={formData.diagnosis}
                                    onChange={handleChange}
                                    rows={3}
                                    placeholder="Fault finding, measurements, observations…"
                                    onVoiceSaved={addVoiceClip}
                                    onVoiceClipUpdate={updateVoiceClip}
                                    voiceClips={voiceAttachments.filter((c) => c.section === 'diagnosis')}
                                />
                            </div>
                            <div className="rounded-lg border border-slate-200/90 bg-slate-50/80 p-3 dark:border-slate-600 dark:bg-slate-900/40">
                                <h5 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                    Work Done / Carried Out
                                </h5>
                                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                    Detail the corrective actions and resolution steps.
                                </p>
                                <label className="mb-1 mt-3 block text-xs font-medium text-gray-700 dark:text-slate-300">
                                    Work Done / Carried Out Notes
                                </label>
                                <VoiceNoteTextarea
                                    sectionId="actionsTaken"
                                    name="actionsTaken"
                                    value={formData.actionsTaken}
                                    onChange={handleChange}
                                    rows={3}
                                    placeholder="Work performed, parts used, tests, handover…"
                                    onVoiceSaved={addVoiceClip}
                                    onVoiceClipUpdate={updateVoiceClip}
                                    voiceClips={voiceAttachments.filter((c) => c.section === 'actionsTaken')}
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-slate-300">
                                    Future work required
                                </label>
                                <VoiceNoteTextarea
                                    sectionId="futureWorkRequired"
                                    name="futureWorkRequired"
                                    value={formData.futureWorkRequired}
                                    onChange={handleChange}
                                    rows={3}
                                    placeholder="Any remaining work, parts to source, or follow-up tasks..."
                                    onVoiceSaved={addVoiceClip}
                                    onVoiceClipUpdate={updateVoiceClip}
                                    voiceClips={voiceAttachments.filter((c) => c.section === 'futureWorkRequired')}
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-slate-300">
                                    Scheduled follow-up date &amp; time
                                </label>
                                <input
                                    type="datetime-local"
                                    name="futureWorkScheduledAt"
                                    value={formData.futureWorkScheduledAt}
                                    onChange={handleChange}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                                />
                            </div>
                        </div>
                    </section>

                    {/* Job checklists / service forms */}
                    <section className="rounded-xl border border-indigo-200/80 bg-indigo-50/30 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                    Job checklists &amp; forms
                                </h4>
                                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                    Attach templates and complete fields (synced after save).
                                    {loadingServerForms ? ' Loading existing forms…' : ''}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowTemplateModal(true)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
                            >
                                <i className="fas fa-plus text-[10px]" />
                                Add checklist
                            </button>
                        </div>
                        {ensureServiceFormsArray(formData).length > 0 ? (
                            <div className="mt-4 space-y-4">
                                {ensureServiceFormsArray(formData).map((form) => {
                                    const fields = Array.isArray(form.templateFields) ? form.templateFields : [];
                                    return (
                                        <div
                                            key={form.id}
                                            className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-600 dark:bg-slate-900/40"
                                        >
                                            <div className="mb-2 flex items-start justify-between gap-2">
                                                <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                                                    {form.templateName || 'Checklist'}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveForm(form.id)}
                                                    className="text-slate-400 hover:text-red-600"
                                                    title="Remove"
                                                >
                                                    <i className="fas fa-trash text-xs" />
                                                </button>
                                            </div>
                                            {fields.length === 0 ? (
                                                <p className="text-xs text-slate-500">No fields on this template.</p>
                                            ) : (
                                                <div className="space-y-3">
                                                    {fields.map((field, fidx) => {
                                                        const fieldId = field.id || `field_${fidx}`;
                                                        const val = (form.answers || {})[fieldId] ?? '';
                                                        const controlId = `classic_${form.id}_${fieldId}`;
                                                        if (field.visibilityCondition && field.visibilityCondition.fieldId) {
                                                            const refVal = String(
                                                                (form.answers || {})[field.visibilityCondition.fieldId] || ''
                                                            ).toLowerCase();
                                                            const exp = String(
                                                                field.visibilityCondition.equals || ''
                                                            ).toLowerCase();
                                                            if (!exp || refVal !== exp) return null;
                                                        }
                                                        return (
                                                            <div key={fieldId}>
                                                                <label
                                                                    className="mb-0.5 block text-[11px] font-medium text-slate-600 dark:text-slate-400"
                                                                    htmlFor={controlId}
                                                                >
                                                                    {field.label || 'Field'}
                                                                </label>
                                                                {field.type === 'textarea' ? (
                                                                    <VoiceNoteTextarea
                                                                        sectionId={`form_${form.id}_${fieldId}`}
                                                                        name={fieldId}
                                                                        value={val}
                                                                        onChange={(ev) =>
                                                                            handleFormAnswerChange(
                                                                                form.id,
                                                                                fieldId,
                                                                                ev.target.value
                                                                            )
                                                                        }
                                                                        rows={2}
                                                                        onVoiceSaved={addVoiceClip}
                                                                        onVoiceClipUpdate={updateVoiceClip}
                                                                        voiceClips={voiceAttachments.filter(
                                                                            (c) =>
                                                                                c.section ===
                                                                                `form_${form.id}_${fieldId}`
                                                                        )}
                                                                    />
                                                                ) : field.type === 'number' ? (
                                                                    <input
                                                                        id={controlId}
                                                                        type="number"
                                                                        value={val}
                                                                        onChange={(ev) =>
                                                                            handleFormAnswerChange(
                                                                                form.id,
                                                                                fieldId,
                                                                                ev.target.value
                                                                            )
                                                                        }
                                                                        className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                                                                    />
                                                                ) : field.type === 'checkbox' ? (
                                                                    <select
                                                                        id={controlId}
                                                                        value={val}
                                                                        onChange={(ev) =>
                                                                            handleFormAnswerChange(
                                                                                form.id,
                                                                                fieldId,
                                                                                ev.target.value
                                                                            )
                                                                        }
                                                                        className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                                                                    >
                                                                        <option value="">Select…</option>
                                                                        <option value="yes">Yes</option>
                                                                        <option value="no">No</option>
                                                                    </select>
                                                                ) : field.type === 'select' ? (
                                                                    <select
                                                                        id={controlId}
                                                                        value={val}
                                                                        onChange={(ev) =>
                                                                            handleFormAnswerChange(
                                                                                form.id,
                                                                                fieldId,
                                                                                ev.target.value
                                                                            )
                                                                        }
                                                                        className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                                                                    >
                                                                        <option value="">Select…</option>
                                                                        {(field.options || []).map((opt) => (
                                                                            <option key={opt} value={opt}>
                                                                                {opt}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                ) : (
                                                                    <input
                                                                        id={controlId}
                                                                        type="text"
                                                                        value={val}
                                                                        onChange={(ev) =>
                                                                            handleFormAnswerChange(
                                                                                form.id,
                                                                                fieldId,
                                                                                ev.target.value
                                                                            )
                                                                        }
                                                                        className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                                                                    />
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                                No checklists added. Use &quot;Add checklist&quot; to attach a template.
                            </p>
                        )}
                    </section>

                    {/* Stock used */}
                    <div className="rounded-xl border border-gray-200 p-3 dark:border-slate-600">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <label className="text-xs font-medium text-gray-700 dark:text-slate-300">Stock used</label>
                            <div className="flex flex-wrap gap-1.5">
                                <button
                                    type="button"
                                    onClick={addStockRow}
                                    className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200"
                                >
                                    <i className="fas fa-plus mr-1" /> Add line
                                </button>
                                <button
                                    type="button"
                                    onClick={addStockRowAtNewLocation}
                                    className="text-xs px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 dark:bg-blue-900/30 dark:border-blue-800/60 dark:text-blue-200 dark:hover:bg-blue-900/50"
                                >
                                    <i className="fas fa-map-marker-alt mr-1" /> Add another stock location
                                </button>
                            </div>
                        </div>
                        {(formData.stockUsed || []).length === 0 ? (
                            <p className="text-xs text-gray-500 dark:text-slate-400">No stock lines. Add consumables used on site.</p>
                        ) : (
                            <div className="space-y-2">
                                <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1 dark:bg-amber-900/30 dark:border-amber-800/60 dark:text-amber-200">
                                    Pick the <strong>location</strong> first (each bakkie or warehouse). The SKU list shows only items on hand at that site. Use <strong>Add another stock location</strong> when stock comes from more than one place on the same job.
                                </p>
                                {(formData.stockUsed || []).map((row, idx) => {
                                    const locId = row.locationId || '';
                                    const items = inventoryByLocation[locId] || [];
                                    const knownSkus = new Set(items.map((it) => String(it.sku)));
                                    const hasUnknownSelectedSku =
                                        Boolean(row.sku) && !knownSkus.has(String(row.sku));
                                    const prevLocId =
                                        idx > 0
                                            ? String((formData.stockUsed || [])[idx - 1]?.locationId || '')
                                            : '';
                                    const curLocId = String(locId || '');
                                    const showLocationGroup =
                                        idx === 0 || curLocId !== prevLocId;
                                    const locLabel =
                                        row.locationName ||
                                        stockLocations.find((l) => String(l.id) === curLocId)?.name ||
                                        '';
                                    return (
                                        <div
                                            key={idx}
                                            className={
                                                showLocationGroup && idx > 0
                                                    ? 'pt-2 border-t border-slate-200 dark:border-slate-600'
                                                    : ''
                                            }
                                        >
                                            {showLocationGroup && (formData.stockUsed || []).length > 1 && (
                                                <p className="text-[10px] font-medium text-gray-600 dark:text-slate-400 mb-1">
                                                    {curLocId
                                                        ? `Stock from: ${locLabel || 'selected location'}`
                                                        : 'Another stock location — choose location below'}
                                                </p>
                                            )}
                                        <div className="grid grid-cols-12 gap-2 items-end">
                                            <div className="col-span-3">
                                                <span className="text-[10px] text-gray-500 dark:text-slate-400">Location</span>
                                                <select
                                                    value={row.locationId || ''}
                                                    onChange={(e) => handleStockLocationChange(idx, e.target.value)}
                                                    className="w-full px-2 py-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                                                >
                                                    <option value="">Select location…</option>
                                                    {stockLocations.map((loc) => (
                                                        <option key={loc.id} value={loc.id}>
                                                            {loc.name}{loc.code ? ` (${loc.code})` : ''}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="col-span-4">
                                                <span className="text-[10px] text-gray-500 dark:text-slate-400">SKU</span>
                                                <select
                                                    value={row.sku || ''}
                                                    onChange={(e) => handleStockSkuChange(idx, e.target.value)}
                                                    disabled={!row.locationId}
                                                    className="w-full px-2 py-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 disabled:bg-gray-100 disabled:cursor-not-allowed dark:disabled:bg-slate-800"
                                                >
                                                    <option value="">
                                                        {row.locationId
                                                            ? items.length === 0
                                                                ? 'No on-hand stock at this location'
                                                                : 'Select SKU…'
                                                            : 'Choose location first…'}
                                                    </option>
                                                    {items.map((it) => {
                                                        const qty = Number(it.quantity) || 0;
                                                        return (
                                                            <option key={it.sku} value={it.sku}>
                                                                {(it.name || it.sku)} ({it.sku}) — {qty} on hand
                                                            </option>
                                                        );
                                                    })}
                                                    {hasUnknownSelectedSku && (
                                                        <option value={row.sku}>
                                                            {row.itemName ? `${row.itemName} (${row.sku})` : row.sku} — saved value
                                                        </option>
                                                    )}
                                                </select>
                                            </div>
                                            <div className="col-span-2">
                                                <span className="text-[10px] text-gray-500 dark:text-slate-400">Qty</span>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={row.quantity ?? ''}
                                                    onChange={e => updateStockRow(idx, { quantity: e.target.value })}
                                                    className="w-full px-2 py-1 text-xs border rounded dark:bg-slate-700 dark:border-slate-600"
                                                />
                                            </div>
                                            <div className="col-span-2">
                                                <span className="text-[10px] text-gray-500 dark:text-slate-400">Item name</span>
                                                <input
                                                    type="text"
                                                    value={row.itemName || ''}
                                                    readOnly
                                                    placeholder="Auto-filled"
                                                    className="w-full px-2 py-1 text-xs border rounded bg-gray-50 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200"
                                                />
                                            </div>
                                            <div className="col-span-1 flex justify-end pb-1">
                                                <button
                                                    type="button"
                                                    onClick={() => removeStockRow(idx)}
                                                    className="text-red-500 hover:text-red-700 text-xs"
                                                    title="Remove"
                                                >
                                                    <i className="fas fa-times" />
                                                </button>
                                            </div>
                                        </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Materials bought */}
                    <div className="border border-gray-200 rounded-lg p-3 dark:border-slate-600">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-medium text-gray-700 dark:text-slate-300">Materials / purchases</label>
                            <button
                                type="button"
                                onClick={addMaterialRow}
                                className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200"
                            >
                                <i className="fas fa-plus mr-1" /> Add line
                            </button>
                        </div>
                        {(formData.materialsBought || []).length === 0 ? (
                            <p className="text-xs text-gray-500 dark:text-slate-400">No purchase lines.</p>
                        ) : (
                            <div className="space-y-2">
                                {(formData.materialsBought || []).map((row, idx) => (
                                    <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                                        <div className="col-span-4">
                                            <span className="text-[10px] text-gray-500 dark:text-slate-400">Item</span>
                                            <input
                                                type="text"
                                                value={row.itemName || ''}
                                                onChange={e => updateMaterialRow(idx, { itemName: e.target.value })}
                                                className="w-full px-2 py-1 text-xs border rounded dark:bg-slate-700 dark:border-slate-600"
                                            />
                                        </div>
                                        <div className="col-span-2">
                                            <span className="text-[10px] text-gray-500 dark:text-slate-400">Cost</span>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={row.cost ?? ''}
                                                onChange={e => updateMaterialRow(idx, { cost: e.target.value })}
                                                className="w-full px-2 py-1 text-xs border rounded dark:bg-slate-700 dark:border-slate-600"
                                            />
                                        </div>
                                        <div className="col-span-5">
                                            <span className="text-[10px] text-gray-500 dark:text-slate-400">Reason / notes</span>
                                            <input
                                                type="text"
                                                value={row.reason || ''}
                                                onChange={e => updateMaterialRow(idx, { reason: e.target.value })}
                                                className="w-full px-2 py-1 text-xs border rounded dark:bg-slate-700 dark:border-slate-600"
                                            />
                                        </div>
                                        <div className="col-span-1 flex justify-end pb-1">
                                            <button
                                                type="button"
                                                onClick={() => removeMaterialRow(idx)}
                                                className="text-red-500 hover:text-red-700 text-xs"
                                                title="Remove"
                                            >
                                                <i className="fas fa-times" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-600 dark:bg-slate-800/50">
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            Additional notes
                        </h4>
                        <div className="mt-3">
                            <VoiceNoteTextarea
                                sectionId="otherComments"
                                name="otherComments"
                                value={formData.otherComments}
                                onChange={handleChange}
                                rows={2}
                                placeholder="Handover, risks, follow-up…"
                                onVoiceSaved={addVoiceClip}
                                onVoiceClipUpdate={updateVoiceClip}
                                voiceClips={voiceAttachments.filter((c) => c.section === 'otherComments')}
                            />
                        </div>
                    </section>

                    {/* Photos & video */}
                    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-600 dark:bg-slate-800/50">
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            Photos &amp; video
                        </h4>
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            Same limits as the mobile wizard (images up to 10MB, videos up to 50MB each).
                        </p>
                        <div className="mt-3 border-2 border-dashed border-gray-300 rounded-xl p-4 text-center dark:border-slate-600">
                            <input
                                type="file"
                                id="photoUploadClassic"
                                onChange={handlePhotoUpload}
                                className="hidden"
                                accept="image/*,video/*"
                                multiple
                            />
                            <label htmlFor="photoUploadClassic" className="cursor-pointer">
                                <span className="mb-2 inline-flex items-center justify-center gap-3 text-slate-400">
                                    <i className="fas fa-camera text-3xl dark:text-slate-500" />
                                    <i className="fas fa-video text-2xl dark:text-slate-500" />
                                </span>
                                <p className="text-sm text-gray-600 dark:text-slate-300">
                                    Add photos or short videos from site
                                </p>
                            </label>
                        </div>
                        {selectedPhotos.length > 0 && (
                            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                {selectedPhotos.map((photo, idx) => {
                                    const url = typeof photo === 'string' ? photo : photo.url;
                                    const isVid = jobCardMediaIsVideoDataUrl(url);
                                    return (
                                        <div key={idx} className="group relative">
                                            {isVid ? (
                                                <video
                                                    src={url}
                                                    className="h-28 w-full rounded-lg border border-slate-200 object-cover dark:border-slate-600"
                                                    controls
                                                    playsInline
                                                    preload="metadata"
                                                />
                                            ) : (
                                                <img
                                                    src={url}
                                                    alt={`Attachment ${idx + 1}`}
                                                    className="h-28 w-full rounded-lg object-cover"
                                                />
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => handleRemovePhoto(idx)}
                                                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs text-white opacity-0 transition group-hover:opacity-100"
                                            >
                                                <i className="fas fa-times" />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </section>

                    {/* Customer acknowledgement */}
                    <section className="rounded-xl border border-emerald-200/90 bg-emerald-50/40 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            Customer acknowledgement
                        </h4>
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            Optional sign-off captured with the job card (stored with photos / summary).
                        </p>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-slate-300">
                                    Customer name
                                </label>
                                <input
                                    type="text"
                                    name="customerName"
                                    value={formData.customerName}
                                    onChange={handleChange}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                                    placeholder="Full name"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-slate-300">
                                    Position / title
                                </label>
                                <input
                                    type="text"
                                    name="customerTitle"
                                    value={formData.customerTitle}
                                    onChange={handleChange}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                                    placeholder="Role on site"
                                />
                            </div>
                        </div>
                        <div className="mt-3">
                            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-slate-300">
                                Customer feedback
                            </label>
                            <VoiceNoteTextarea
                                sectionId="customerFeedback"
                                name="customerFeedback"
                                value={formData.customerFeedback}
                                onChange={handleChange}
                                rows={2}
                                placeholder="Comments from the customer"
                                onVoiceSaved={addVoiceClip}
                                onVoiceClipUpdate={updateVoiceClip}
                                voiceClips={voiceAttachments.filter((c) => c.section === 'customerFeedback')}
                            />
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-slate-300">
                                    Sign-off date
                                </label>
                                <input
                                    type="date"
                                    name="customerSignDate"
                                    value={formData.customerSignDate}
                                    onChange={handleChange}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                                />
                            </div>
                        </div>
                        <div className="mt-4">
                            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-slate-300">
                                Signature
                            </label>
                            <div
                                ref={signatureWrapperRef}
                                className={`signature-wrapper relative overflow-hidden rounded-xl border-2 bg-white dark:bg-slate-900 ${
                                    signatureLocked || hasSignature
                                        ? 'border-emerald-500'
                                        : 'border-slate-300 dark:border-slate-600'
                                }`}
                            >
                                <canvas
                                    ref={signatureCanvasRef}
                                    className={`signature-canvas block h-[180px] w-full touch-none ${
                                        signatureLocked ? 'pointer-events-none opacity-0' : ''
                                    }`}
                                    style={{ touchAction: 'none' }}
                                    onPointerDown={startSignature}
                                    onPointerMove={drawSignature}
                                    onPointerUp={endSignature}
                                    onPointerLeave={endSignature}
                                />
                                {signatureLocked && formData.customerSignature ? (
                                    <img
                                        src={formData.customerSignature}
                                        alt="Saved customer signature"
                                        className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                                    />
                                ) : null}
                                {!hasSignature && !signatureLocked && (
                                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                        <span className="text-xs text-slate-400">Sign with mouse or touch</span>
                                    </div>
                                )}
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-3">
                                {signatureLocked ? (
                                    <>
                                        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                                            <i className="fa-solid fa-lock mr-1" aria-hidden />
                                            Signature saved
                                        </span>
                                        <button
                                            type="button"
                                            onClick={clearSignature}
                                            className="text-xs font-medium text-primary-600 hover:text-primary-800 dark:text-primary-400"
                                        >
                                            Clear and re-sign
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            type="button"
                                            onClick={captureSignature}
                                            disabled={!hasSignature}
                                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            Save signature
                                        </button>
                                        <button
                                            type="button"
                                            onClick={clearSignature}
                                            disabled={!hasSignature}
                                            className="text-xs font-medium text-primary-600 hover:text-primary-800 disabled:opacity-50 dark:text-primary-400"
                                        >
                                            Clear
                                        </button>
                                        <span className="text-xs text-slate-500 dark:text-slate-400">
                                            Tap Save after the customer signs so it cannot be overwritten while scrolling.
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* Status */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                            Status
                        </label>
                        <select
                            name="status"
                            value={formData.status}
                            onChange={handleChange}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                        >
                            <option value="draft">Draft</option>
                            <option value="submitted">Submitted</option>
                            <option value="completed">Completed</option>
                        </select>
                    </div>
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 flex-col gap-2 border-t border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/80 sm:px-6">
                    {submitError ? (
                        <div
                            role="alert"
                            className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200"
                        >
                            {submitError}
                        </div>
                    ) : null}
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            disabled={saving}
                            onClick={(ev) => handleSubmit(ev, { forceStatus: 'draft' })}
                            className="flex-1 rounded-lg border border-primary-300 bg-primary-50 px-4 py-2.5 text-sm font-medium text-primary-700 transition hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-primary-700 dark:bg-primary-900/30 dark:text-primary-200 dark:hover:bg-primary-900/50"
                        >
                            {saving ? 'Saving…' : 'Save Draft'}
                        </button>
                        <button
                            type="button"
                            disabled={saving}
                            onClick={(ev) => handleSubmit(ev)}
                            className="flex-1 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {saving ? 'Saving…' : jobCard ? 'Update Job Card' : 'Create Job Card'}
                        </button>
                    </div>
                    </div>
                </form>

                {showTemplateModal && (
                    <div
                        className="absolute inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
                        onClick={() => setShowTemplateModal(false)}
                        role="presentation"
                    >
                        <div
                            className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-4 shadow-xl dark:bg-slate-800"
                            onClick={(ev) => ev.stopPropagation()}
                        >
                            <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-600">
                                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                    Select a checklist template
                                </h4>
                                <button
                                    type="button"
                                    onClick={() => setShowTemplateModal(false)}
                                    className="text-slate-400 hover:text-slate-600"
                                >
                                    <i className="fas fa-times" />
                                </button>
                            </div>
                            {loadingTemplates ? (
                                <p className="py-6 text-center text-sm text-slate-500">Loading templates…</p>
                            ) : formTemplates.length === 0 ? (
                                <p className="py-6 text-center text-sm text-slate-500">
                                    No templates available. An admin can create them under Service &amp; Maintenance.
                                </p>
                            ) : (
                                <ul className="space-y-2">
                                    {formTemplates.map((t) => (
                                        <li key={t.id}>
                                            <button
                                                type="button"
                                                onClick={() => handleAddForm(t.id)}
                                                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-left text-sm transition hover:border-primary-400 hover:bg-primary-50 dark:border-slate-600 dark:hover:bg-slate-700"
                                            >
                                                <span className="font-medium text-slate-900 dark:text-slate-100">
                                                    {t.name}
                                                </span>
                                                {t.description ? (
                                                    <span className="mt-0.5 block text-xs text-slate-500">
                                                        {t.description}
                                                    </span>
                                                ) : null}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// Make available globally
window.JobCardModal = JobCardModal;

