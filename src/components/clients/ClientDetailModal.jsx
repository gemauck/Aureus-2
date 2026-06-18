// Get React hooks from window
// VERSION: Contact filter updated - removed "All Contacts" option
// DEPLOYMENT FIX: Contact filter now only shows site-specific contacts
// FIX: Added useRef to prevent form reset when user is editing
// FIX: formData initialization moved to top to prevent TDZ errors
const { useState, useEffect, useRef, useCallback } = React;

function getContactSiteIds(contact) {
    if (!contact) return [];
    if (Array.isArray(contact.siteIds)) {
        return [...new Set(contact.siteIds.map((id) => String(id).trim()).filter(Boolean))];
    }
    const legacy = contact.siteId && String(contact.siteId).trim();
    return legacy ? [legacy] : [];
}

function contactIsLinkedToSite(contact, siteId) {
    return getContactSiteIds(contact).includes(String(siteId));
}

function addSiteIdToContact(contact, siteId) {
    const ids = getContactSiteIds(contact);
    const sid = String(siteId);
    if (ids.includes(sid)) return contact;
    const next = [...ids, sid];
    return { ...contact, siteIds: next, siteId: next[0] || null };
}

function removeSiteIdFromContact(contact, siteId) {
    const next = getContactSiteIds(contact).filter((id) => id !== String(siteId));
    return { ...contact, siteIds: next, siteId: next[0] || null };
}

/** Merge contacts by id; union siteIds so link/unlink state is not lost on DB reload. */
function mergeContactRecords(items = [], extras = []) {
    const byId = new Map();
    [...(items || []), ...(extras || [])].forEach((c) => {
        if (!c || c.id == null || c.id === '') return;
        const id = String(c.id);
        const prev = byId.get(id);
        const siteIds = [...new Set([...getContactSiteIds(prev), ...getContactSiteIds(c)])];
        byId.set(id, { ...(prev || {}), ...c, siteIds, siteId: siteIds[0] || null });
    });
    return Array.from(byId.values());
}

/** Client account status (Overview tab) — not lead pipeline stages. */
function normalizeClientAccountStatus(statusOrStage) {
    const s = String(statusOrStage ?? 'Active').trim().toLowerCase();
    return s === 'inactive' ? 'Inactive' : 'Active';
}

function clientEngagementStageFromAccountStatus(statusOrStage) {
    return normalizeClientAccountStatus(statusOrStage) === 'Inactive' ? 'inactive' : 'Active';
}

const LEAD_PROPOSAL_PROCESS_STEPS = [
    { step: 1, label: 'Customer Engagement Mandate' },
    { step: 2, label: 'Proposal Drafting' },
    { step: 3, label: 'Circulation for comment, pricing and approval' },
    { step: 4, label: 'Submission to Client' },
];

/** Step 3 circulation — keys must match api/_lib/leadProposalWorkflow.js LEAD_PROPOSAL_CIRCULATION_DEPT_KEYS */
const LEAD_PROPOSAL_CIRCULATION_DEPARTMENTS = [
    { key: 'technical', label: 'Technical' },
    { key: 'support', label: 'Support' },
    { key: 'data', label: 'Data' },
    { key: 'compliance', label: 'Compliance' },
    { key: 'businessDevelopment', label: 'Business Development' },
    { key: 'commercialAndPricing', label: 'Commercial and Pricing' },
    { key: 'legalOperationsReview', label: 'Legal / Operations Review' },
    { key: 'director', label: 'Director' },
];

function defaultCirculationDepartmentsUi() {
    const o = {};
    for (const d of LEAD_PROPOSAL_CIRCULATION_DEPARTMENTS) {
        o[d.key] = { comment: '', responsibleUserId: '' };
    }
    return o;
}

function normalizeCirculationDepartmentsUi(rawWorkflow) {
    const base = defaultCirculationDepartmentsUi();
    const circIn =
        rawWorkflow?.circulationDepartments && typeof rawWorkflow.circulationDepartments === 'object'
            ? rawWorkflow.circulationDepartments
            : {};
    for (const d of LEAD_PROPOSAL_CIRCULATION_DEPARTMENTS) {
        const row = circIn[d.key] && typeof circIn[d.key] === 'object' ? circIn[d.key] : {};
        base[d.key] = {
            comment: String(row.comment || ''),
            responsibleUserId: String(row.responsibleUserId || '').trim()
        };
    }
    const legacy = String(rawWorkflow?.departmentalComments || '').trim();
    if (legacy && !base.technical.comment) {
        base.technical = { ...base.technical, comment: legacy };
    }
    return base;
}

function defaultLeadProposalWorkflow() {
    return {
        currentStep: 1,
        engagementQuestionnaireId: '',
        manualEngagementMandateLink: '',
        manualEngagementMandateUploadedName: '',
        departmentalComments: '',
        circulationDepartments: defaultCirculationDepartmentsUi(),
        signOffBy: '',
        submittedToClientAt: null,
        submissionNotes: '',
        workingDraftUploadedName: ''
    };
}

function normalizeLeadProposalWorkflowUi(raw) {
    const base = defaultLeadProposalWorkflow();
    if (!raw || typeof raw !== 'object') return base;
    let step = Number(raw.currentStep);
    if (!Number.isFinite(step)) step = 1;
    return {
        ...base,
        currentStep: Math.min(4, Math.max(1, Math.floor(step))),
        engagementQuestionnaireId: String(raw.engagementQuestionnaireId || '').trim(),
        departmentalComments: String(raw.departmentalComments || ''),
        circulationDepartments: normalizeCirculationDepartmentsUi(raw),
        signOffBy: String(raw.signOffBy || '').trim(),
        submittedToClientAt:
            typeof raw.submittedToClientAt === 'string' && raw.submittedToClientAt.trim()
                ? raw.submittedToClientAt.trim()
                : null,
        submissionNotes: String(raw.submissionNotes || ''),
        manualEngagementMandateLink: String(raw.manualEngagementMandateLink || '').trim(),
        manualEngagementMandateUploadedName: String(raw.manualEngagementMandateUploadedName || '').trim(),
        workingDraftUploadedName: String(raw.workingDraftUploadedName || '').trim()
    };
}

function proposalWorkingDocBasename(url) {
    try {
        const p = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'https://placeholder.local');
        const seg = p.pathname.split('/').filter(Boolean);
        return decodeURIComponent(seg[seg.length - 1] || '').replace(/\+/g, ' ') || 'Document';
    } catch {
        return 'Document';
    }
}

function toAbsoluteProposalDocUrl(url) {
    const u = String(url || '').trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    const origin = typeof window !== 'undefined' ? window.location.origin.replace(/\/$/, '') : '';
    return `${origin}${u.startsWith('/') ? '' : '/'}${u}`;
}

/** Distinguish uploaded server files vs cloud document URLs */
function classifyProposalWorkingDocument(url) {
    const raw = String(url || '').trim();
    if (!raw) return { kind: 'empty', url: '' };
    try {
        const abs = toAbsoluteProposalDocUrl(raw);
        const parsed = new URL(abs);
        const path = parsed.pathname.toLowerCase();
        const host = parsed.hostname.toLowerCase();
        const sameOrigin = typeof window !== 'undefined' && parsed.origin === window.location.origin;
        const isUpload =
            path.includes('/uploads/') ||
            path.includes('/lead-proposals/') ||
            path.includes('/lead-engagement-mandates/') ||
            (sameOrigin && path.includes('upload'));
        const isCloud =
            host.includes('drive.google.com') ||
            host.includes('docs.google.com') ||
            (host.includes('google.com') && path.includes('/document')) ||
            host.includes('dropbox.com') ||
            host.includes('sharepoint.com') ||
            host.includes('onedrive.') ||
            host.includes('box.com') ||
            host.includes('notion.so');
        if (isUpload) return { kind: 'upload', url: abs };
        if (isCloud) return { kind: 'cloud', url: abs };
        if (/^https?:\/\//i.test(raw)) return { kind: 'cloud', url: abs };
        return { kind: 'link', url: abs };
    } catch {
        return { kind: 'link', url: raw };
    }
}

function proposalDocIconMeta(filenameOrUrl) {
    const name = String(filenameOrUrl || '').toLowerCase();
    const ext = name.includes('.') ? name.split('.').pop() : '';
    if (['xlsx', 'xls', 'csv'].includes(ext)) {
        return { icon: 'fa-file-excel', color: 'text-emerald-600', bg: 'bg-emerald-500/15' };
    }
    if (ext === 'pdf') return { icon: 'fa-file-pdf', color: 'text-red-600', bg: 'bg-red-500/15' };
    if (['doc', 'docx'].includes(ext)) {
        return { icon: 'fa-file-word', color: 'text-blue-600', bg: 'bg-blue-500/15' };
    }
    if (['ppt', 'pptx'].includes(ext)) {
        return { icon: 'fa-file-powerpoint', color: 'text-orange-600', bg: 'bg-orange-500/15' };
    }
    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
        return { icon: 'fa-file-image', color: 'text-purple-600', bg: 'bg-purple-500/15' };
    }
    return { icon: 'fa-file-alt', color: 'text-gray-600', bg: 'bg-gray-500/15' };
}

function shortCloudLinkLabel(url) {
    try {
        const u = new URL(url);
        const h = u.hostname.replace(/^www\./, '');
        const tail = u.pathname + u.search;
        const short = tail.length > 36 ? `${tail.slice(0, 34)}…` : tail;
        return `${h}${short === '/' ? '' : short}`;
    } catch {
        return String(url).slice(0, 72);
    }
}

// Module-level tracking to prevent duplicate loads across remounts
// This persists even if the component remounts
const clientInitialLoadTracker = new Map(); // Map<clientId, Promise>

// Tab preservation: after adding/updating contacts, sites, or calendar entries we keep the
// current tab and ignore initialTab/client-id effects for this many ms so the UI doesn't
// jump back to Overview. Must be long enough for parent re-renders and effect runs to settle.
const TAB_PRESERVE_AFTER_INLINE_SAVE_MS = 3500;

function buildEngagementPrefillDraft(formDef, storedPrefill, leadName) {
    if (!formDef?.sections) return {};
    const draft = {};
    const storedObj = storedPrefill && typeof storedPrefill === 'object' && !Array.isArray(storedPrefill) ? storedPrefill : {};
    for (const sec of formDef.sections) {
        for (const f of sec.fields) {
            if (f.type === 'fileList') continue;
            if (f.type === 'checkboxGroup') {
                const next = {};
                for (const opt of f.options || []) {
                    next[opt.id] = storedObj[f.id]?.[opt.id] === true;
                }
                draft[f.id] = next;
            } else {
                const v = storedObj[f.id];
                draft[f.id] = typeof v === 'string' ? v : '';
            }
        }
    }
    const nm = String(leadName || '').trim();
    if (nm && !String(draft['general.clientName'] || '').trim()) {
        draft['general.clientName'] = nm;
    }
    return draft;
}

function normalizeEngagementQuestionnaires(value) {
    return Array.isArray(value) ? value.filter((q) => q && typeof q === 'object') : [];
}

function sanitizeEngagementCustomFields(value) {
    if (!Array.isArray(value)) return [];
    const out = [];
    const seen = new Set();
    value.forEach((f, i) => {
        if (!f || typeof f !== 'object') return;
        const label = String(f.label || '').trim();
        if (!label) return;
        const typeRaw = String(f.type || 'text').trim().toLowerCase();
        const type = ['text', 'textarea', 'date'].includes(typeRaw) ? typeRaw : 'text';
        const idSeed = String(f.id || label)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '') || `field_${i + 1}`;
        const id = `custom.${idSeed}`;
        if (seen.has(id)) return;
        seen.add(id);
        out.push({
            id,
            type,
            label,
            required: f.required === true,
            placeholder: typeof f.placeholder === 'string' ? f.placeholder : '',
            hint: typeof f.hint === 'string' ? f.hint : '',
            maxLength: Number.isFinite(Number(f.maxLength)) ? Number(f.maxLength) : 400
        });
    });
    return out;
}

function buildEngagementFormWithCustomFields(baseForm, customFields) {
    if (!baseForm || !Array.isArray(baseForm.sections)) return baseForm;
    const form = {
        ...baseForm,
        sections: baseForm.sections.map((sec) => ({ ...sec, fields: Array.isArray(sec.fields) ? [...sec.fields] : [] }))
    };
    const extra = sanitizeEngagementCustomFields(customFields);
    if (extra.length > 0) {
        form.sections.push({
            id: 'custom',
            heading: 'Additional information',
            fields: extra
        });
    }
    return form;
}

/** Human-readable lines for stored prefill (what was embedded for the respondent). */
function resolveEngagementPrefillLines(formDef, prefill) {
    if (!formDef?.sections || !prefill || typeof prefill !== 'object') return [];
    const idToLabel = {};
    for (const sec of formDef.sections) {
        for (const f of sec.fields || []) {
            idToLabel[f.id] = f.label || f.id;
        }
    }
    return Object.entries(prefill).map(([k, raw]) => {
        let display = '';
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            const parts = [];
            for (const [optId, on] of Object.entries(raw)) {
                if (on) parts.push(String(optId).replace(/_/g, ' '));
            }
            display = parts.join(', ');
        } else if (raw != null && raw !== '') {
            display = String(raw);
        }
        return { label: idToLabel[k] || k, value: display };
    });
}

const ClientDetailModal = ({ client, onSave, onUpdate, onClose, onDelete, allProjects, onNavigateToProject, isFullPage = false, isEditing = false, hideSearchFilters = false, initialTab = 'overview', onTabChange, onPauseSync, onEditingChange, onOpenOpportunity, entityType = 'client', onConvertToClient, onRevertToLead, initialSiteId, onInitialSiteOpened, initialProposalId }) => {
    // entityType: 'client' or 'lead' - determines terminology and behavior
    const isLead = entityType === 'lead';
    const entityLabel = isLead ? 'Lead' : 'Client';
    const entityLabelLower = isLead ? 'lead' : 'client';
    // CRITICAL: Initialize formData FIRST, before any other hooks or refs that might reference it
    // This prevents "Cannot access 'formData' before initialization" errors
    const mergeUniqueById = (items = [], extras = []) => {
        // CRITICAL: Deduplicate by name+email FIRST, then by ID
        // This prevents duplicates with same name/email but different IDs
        const mapByKey = new Map(); // Primary: deduplicate by name+email
        
        [...(items || []), ...(extras || [])].forEach(item => {
            if (!item) return;
            
            // Create a unique key from name+email for primary deduplication
            const name = String(item.name || '').toLowerCase().trim();
            const email = String(item.email || '').toLowerCase().trim();
            const key = name || email ? `${name}::${email}` : null;
            
            if (key) {
                // Primary deduplication by name+email
                if (mapByKey.has(key)) {
                    // Same name+email already exists - keep the one with more data
                    const existing = mapByKey.get(key);
                    const existingFieldCount = Object.values(existing).filter(v => v !== null && v !== undefined && v !== '').length;
                    const newFieldCount = Object.values(item).filter(v => v !== null && v !== undefined && v !== '').length;
                    
                    // If new item has more data, replace; otherwise keep existing
                    if (newFieldCount > existingFieldCount) {
                        mapByKey.set(key, item);
                    }
                } else {
                    // First occurrence of this name+email combination
                    mapByKey.set(key, item);
                }
            } else if (item.id) {
                // No name/email but has ID - use ID as fallback key
                const id = String(item.id);
                if (!mapByKey.has(id)) {
                    mapByKey.set(id, item);
                }
            }
        });
        
        return Array.from(mapByKey.values());
    };

    /** mergeUniqueById is for contacts (name/email); proposals must merge by id with local winning so workingDocumentLink / workflow survive hydration. */
    const mergeLeadProposalsPreferringLocal = (fromApi, prevLocal) => {
        const api = Array.isArray(fromApi) ? fromApi : [];
        const prev = Array.isArray(prevLocal) ? prevLocal : [];
        const prevById = new Map();
        for (const p of prev) {
            if (p && p.id != null && String(p.id).trim() !== '') {
                prevById.set(String(p.id), p);
            }
        }
        const seenApiIds = new Set();
        const out = api.map((row) => {
            const id = row?.id != null ? String(row.id) : '';
            if (id) seenApiIds.add(id);
            const loc = id ? prevById.get(id) : null;
            if (!loc) return row;
            const wfA = row.workflow && typeof row.workflow === 'object' && !Array.isArray(row.workflow) ? row.workflow : {};
            const wfB = loc.workflow && typeof loc.workflow === 'object' && !Array.isArray(loc.workflow) ? loc.workflow : {};
            return {
                ...row,
                ...loc,
                workflow: Object.keys(wfB).length ? { ...wfA, ...wfB } : (loc.workflow !== undefined ? loc.workflow : row.workflow)
            };
        });
        for (const p of prev) {
            const id = p?.id != null ? String(p.id) : '';
            if (id && !seenApiIds.has(id)) out.push(p);
        }
        return out;
    };
    
    const [formData, setFormData] = useState(() => {
        // Parse JSON strings to arrays/objects if needed
        const parsedClient = client ? {
            ...client,
            contacts: typeof client.contacts === 'string' ? JSON.parse(client.contacts || '[]') : (client.contacts || []),
            followUps: typeof client.followUps === 'string' ? JSON.parse(client.followUps || '[]') : (client.followUps || []),
            projectIds: typeof client.projectIds === 'string' ? JSON.parse(client.projectIds || '[]') : (client.projectIds || []),
            comments: typeof client.comments === 'string' ? JSON.parse(client.comments || '[]') : (client.comments || []),
            contracts: typeof client.contracts === 'string' ? JSON.parse(client.contracts || '[]') : (client.contracts || []),
            proposals: typeof client.proposals === 'string' ? JSON.parse(client.proposals || '[]') : (Array.isArray(client.proposals) ? client.proposals : []),
            sites: typeof client.sites === 'string' ? JSON.parse(client.sites || '[]') : (client.sites || []),
            opportunities: typeof client.opportunities === 'string' ? JSON.parse(client.opportunities || '[]') : (client.opportunities || []),
            activityLog: typeof client.activityLog === 'string' ? JSON.parse(client.activityLog || '[]') : (client.activityLog || []),
            services: typeof client.services === 'string' ? JSON.parse(client.services || '[]') : (client.services || []),
            engagementStage: client.engagementStage ?? client.status ?? (isLead ? 'Potential' : undefined),
            status: isLead ? client.status : normalizeClientAccountStatus(client.status ?? client.engagementStage),
            aidaStatus: client.aidaStatus ?? client.stage ?? (isLead ? 'Awareness' : undefined),
            externalAgentId: client.externalAgentId || null,
            externalAgent: client.externalAgent || null,
            billingTerms: typeof client.billingTerms === 'string' ? JSON.parse(client.billingTerms || '{}') : (client.billingTerms || {
                paymentTerms: 'Net 30',
                billingFrequency: 'Monthly',
                currency: 'ZAR',
                retainerAmount: 0,
                taxExempt: false,
                notes: ''
            }),
            kyc: typeof client.kyc === 'string' ? JSON.parse(client.kyc || '{}') : (client.kyc || {
                clientType: '',
                legalEntity: { registeredLegalName: '', tradingName: '', registrationNumber: '', vatNumber: '', incomeTaxNumber: '', registeredAddress: '', principalPlaceOfBusiness: '', countryOfIncorporation: '' },
                directors: [],
                beneficialOwners: [],
                businessProfile: { industrySector: '', coreBusinessActivities: '', primaryOperatingLocations: '', yearsInOperation: '' },
                bankingDetails: { bankName: '', accountHolderName: '', accountNumber: '', branchCode: '', accountType: '' }
            })
        } : {
            name: '',
            type: entityType, // Use entityType ('client' or 'lead')
            industry: '',
            engagementStage: isLead ? 'Potential' : 'Active',
            status: isLead ? undefined : 'Active',
            aidaStatus: 'Awareness',
            revenue: 0,
            value: 0,
            probability: 100,
            contacts: [],
            followUps: [],
            projectIds: [],
            comments: [],
            contracts: [],
            proposals: [],
            sites: [],
            opportunities: [],
            activityLog: [],
            services: [],
            billingTerms: {
                paymentTerms: 'Net 30',
                billingFrequency: 'Monthly',
                currency: 'ZAR',
                retainerAmount: 0,
                taxExempt: false,
                notes: ''
            },
            kyc: {
                clientType: '',
                legalEntity: { registeredLegalName: '', tradingName: '', registrationNumber: '', vatNumber: '', incomeTaxNumber: '', registeredAddress: '', principalPlaceOfBusiness: '', countryOfIncorporation: '' },
                directors: [],
                beneficialOwners: [],
                businessProfile: { industrySector: '', coreBusinessActivities: '', primaryOperatingLocations: '', yearsInOperation: '' },
                bankingDetails: { bankName: '', accountHolderName: '', accountNumber: '', branchCode: '', accountType: '' }
            }
        };
        
        return parsedClient;
    });
    
    // Check if current user has admin-equivalent access (admin, superadmin, system_admin, …)
    const user = window.storage?.getUser?.() || {};
    const isAdmin = typeof window.isAdminRole === 'function' && window.isAdminRole(user?.role);
    const canManageLeadClientConversion = isAdmin;
    const canViewContracts = isAdmin;
    const currentUserId = String(user?.sub ?? user?.id ?? '').trim();
    /** True when this user is responsible for any circulation department on any proposal on this lead. */
    const isCirculationAssigneeOnLead =
        isLead &&
        !!currentUserId &&
        Array.isArray(formData.proposals) &&
        formData.proposals.some((p) => {
            const cd = p?.workflow?.circulationDepartments;
            if (!cd || typeof cd !== 'object') return false;
            return Object.values(cd).some(
                (row) => row && String(row.responsibleUserId || '').trim() === currentUserId
            );
        });
    /** Email / notification deep links include proposalId before proposals may be hydrated. */
    const hasLeadProposalDeepLink = isLead && String(initialProposalId || '').trim() !== '';
    const canViewLeadProposals =
        isLead && (isAdmin || isCirculationAssigneeOnLead || hasLeadProposalDeepLink);
    /** Create/remove proposals — keep restricted to admins; assignees only review circulation. */
    const canManageLeadProposals = isAdmin;
    
    // Now initialize other state and refs AFTER formData
    const [activeTab, setActiveTab] = useState(() => {
        // If user tries to access contracts tab but is not admin, default to overview
        if (initialTab === 'contracts' && !canViewContracts) {
            return 'overview';
        }
        if (initialTab === 'proposals' && !canViewLeadProposals) {
            return 'overview';
        }
        // Redirect old 'service' or 'maintenance' tabs to combined 'service-maintenance' tab
        if (initialTab === 'service' || initialTab === 'maintenance') {
            return 'service-maintenance';
        }
        return initialTab;
    });
    const lastInitialTabRef = useRef(initialTab);
    const [uploadingContract, setUploadingContract] = useState(false);
    
    // Track optimistic updates in STATE (not refs) so React re-renders when they change
    const [optimisticContacts, setOptimisticContacts] = useState([]);
    const [optimisticSites, setOptimisticSites] = useState([]);
    
    // Industries state
    const [industries, setIndustries] = useState([]);
    
    // External agents state
    const [externalAgents, setExternalAgents] = useState([]);
    const [isLoadingExternalAgents, setIsLoadingExternalAgents] = useState(false);
    const [showExternalAgentModal, setShowExternalAgentModal] = useState(false);
    const [showManageExternalAgentsModal, setShowManageExternalAgentsModal] = useState(false);
    const [newExternalAgentName, setNewExternalAgentName] = useState('');
    const [isCreatingExternalAgent, setIsCreatingExternalAgent] = useState(false);
    const [isDeletingExternalAgent, setIsDeletingExternalAgent] = useState(false);
    
    // Groups state for Services section
    const [availableGroups, setAvailableGroups] = useState([]);
    const [clientGroupMemberships, setClientGroupMemberships] = useState([]);
    const lastClientGroupMembershipsKeyRef = useRef(null); // avoid setState when data unchanged (stops tag flashing)
    const [isLoadingGroups, setIsLoadingGroups] = useState(false);
    const [showGroupSelector, setShowGroupSelector] = useState(false);
    const [selectedGroupId, setSelectedGroupId] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Track if user has edited the form to prevent unwanted resets
    const hasUserEditedForm = useRef(false);
    const lastSavedClientId = useRef(client?.id);
    
    // Use ref to track latest formData for auto-save
    // CRITICAL: Initialize formDataRef immediately with initial formData value
    // This ensures tabs can access data immediately on first render without waiting for useEffect
    const initialFormData = (() => {
        const parsedClient = client ? {
            ...client,
            contacts: typeof client.contacts === 'string' ? JSON.parse(client.contacts || '[]') : (client.contacts || []),
            followUps: typeof client.followUps === 'string' ? JSON.parse(client.followUps || '[]') : (client.followUps || []),
            projectIds: typeof client.projectIds === 'string' ? JSON.parse(client.projectIds || '[]') : (client.projectIds || []),
            comments: typeof client.comments === 'string' ? JSON.parse(client.comments || '[]') : (client.comments || []),
            contracts: typeof client.contracts === 'string' ? JSON.parse(client.contracts || '[]') : (client.contracts || []),
            proposals: typeof client.proposals === 'string' ? JSON.parse(client.proposals || '[]') : (Array.isArray(client.proposals) ? client.proposals : []),
            sites: typeof client.sites === 'string' ? JSON.parse(client.sites || '[]') : (client.sites || []),
            opportunities: typeof client.opportunities === 'string' ? JSON.parse(client.opportunities || '[]') : (client.opportunities || []),
            activityLog: typeof client.activityLog === 'string' ? JSON.parse(client.activityLog || '[]') : (client.activityLog || []),
            services: typeof client.services === 'string' ? JSON.parse(client.services || '[]') : (client.services || []),
            engagementStage: client.engagementStage ?? client.status ?? (isLead ? 'Potential' : undefined),
            status: isLead ? client.status : normalizeClientAccountStatus(client.status ?? client.engagementStage),
            aidaStatus: client.aidaStatus || client.stage || (isLead ? 'Awareness' : undefined),
            billingTerms: typeof client.billingTerms === 'string' ? JSON.parse(client.billingTerms || '{}') : (client.billingTerms || {
                paymentTerms: 'Net 30',
                billingFrequency: 'Monthly',
                currency: 'ZAR',
                retainerAmount: 0,
                taxExempt: false,
                notes: ''
            }),
            kyc: typeof client.kyc === 'string' ? JSON.parse(client.kyc || '{}') : (client.kyc || {
                clientType: '',
                legalEntity: { registeredLegalName: '', tradingName: '', registrationNumber: '', vatNumber: '', incomeTaxNumber: '', registeredAddress: '', principalPlaceOfBusiness: '', countryOfIncorporation: '' },
                directors: [],
                beneficialOwners: [],
                businessProfile: { industrySector: '', coreBusinessActivities: '', primaryOperatingLocations: '', yearsInOperation: '' },
                bankingDetails: { bankName: '', accountHolderName: '', accountNumber: '', branchCode: '', accountType: '' }
            })
        } : {
            name: '',
            type: entityType,
            industry: '',
            engagementStage: isLead ? 'Potential' : 'Active',
            status: isLead ? undefined : 'Active',
            aidaStatus: 'Awareness',
            revenue: 0,
            value: 0,
            probability: 100,
            contacts: [],
            followUps: [],
            projectIds: [],
            comments: [],
            contracts: [],
            proposals: [],
            sites: [],
            opportunities: [],
            activityLog: [],
            services: [],
            billingTerms: {
                paymentTerms: 'Net 30',
                billingFrequency: 'Monthly',
                currency: 'ZAR',
                retainerAmount: 0,
                taxExempt: false,
                notes: ''
            },
            kyc: {
                clientType: '',
                legalEntity: { registeredLegalName: '', tradingName: '', registrationNumber: '', vatNumber: '', incomeTaxNumber: '', registeredAddress: '', principalPlaceOfBusiness: '', countryOfIncorporation: '' },
                directors: [],
                beneficialOwners: [],
                businessProfile: { industrySector: '', coreBusinessActivities: '', primaryOperatingLocations: '', yearsInOperation: '' },
                bankingDetails: { bankName: '', accountHolderName: '', accountNumber: '', branchCode: '', accountType: '' }
            }
        };
        return parsedClient;
    })();
    const formDataRef = useRef(initialFormData);
    const isAutoSavingRef = useRef(false);
    const lastInlineSaveAtRef = useRef(0); // Timestamp when we last set isAutoSavingRef for add/update/delete (tab-preserve window)
    const activeTabRef = useRef(activeTab); // Mirror of activeTab (use resolved tab, not raw initialTab — e.g. proposals tab is admin-only)
    const lastSavedDataRef = useRef(null); // Track last saved state
    const autoSaveTimeoutRef = useRef(null); // Debounce timer for auto-save
    
    // Track when user is actively typing/editing in an input field
    const isEditingRef = useRef(false);
    const editingTimeoutRef = useRef(null); // Track timeout to clear editing flag
    
    // Track which fields the user has actually entered data into - NEVER overwrite these
    const userEditedFieldsRef = useRef(new Set()); // Set of field names user has edited
    
    // CRITICAL: Track the last client object we processed to detect LiveDataSync updates
    // This helps us run the guard even when the ID hasn't changed but the object reference has
    const lastProcessedClientRef = useRef(null);
    
    // CRITICAL: Track when user has started typing - once they start, NEVER update formData from prop
    const userHasStartedTypingRef = useRef(false);
    
    // Track loading state to prevent duplicate API calls
    const isLoadingContactsRef = useRef(false);
    const isLoadingSitesRef = useRef(false);
    const isLoadingClientRef = useRef(false);
    const isLoadingOpportunitiesRef = useRef(false);
    const pendingTimeoutsRef = useRef([]); // Track all pending timeouts to cancel on unmount
    
    // Track which client ID we've already loaded sites for to prevent infinite loops
    const sitesLoadedForClientIdRef = useRef(null);
    const optimisticSitesRef = useRef(optimisticSites);
    useEffect(() => { optimisticSitesRef.current = optimisticSites; }, [optimisticSites]);
    
    // Track initial loading state to prevent jittery progressive rendering
    // Only render full content once all initial data loads are complete
    const [isInitialLoading, setIsInitialLoading] = useState(false);
    const [engagementBusy, setEngagementBusy] = useState(false);
    const [engagementHint, setEngagementHint] = useState('');
    const [showEngagementResponsesModal, setShowEngagementResponsesModal] = useState(false);
    const [showEngagementPrefillModal, setShowEngagementPrefillModal] = useState(false);
    const [engagementBaseFormDef, setEngagementBaseFormDef] = useState(null);
    const [engagementFormDef, setEngagementFormDef] = useState(null);
    const [engagementPrefillDraft, setEngagementPrefillDraft] = useState({});
    const [engagementPrefillLoading, setEngagementPrefillLoading] = useState(false);
    const [engagementClearSubmission, setEngagementClearSubmission] = useState(false);
    const [engagementReportBranding, setEngagementReportBranding] = useState(null);
    const [engagementReportFormDef, setEngagementReportFormDef] = useState(null);
    const [engagementReportLoading, setEngagementReportLoading] = useState(false);
    /** When set, report modal shows this submission version (1-based); null = latest version or legacy row fields. */
    const [engagementReportVersionNumber, setEngagementReportVersionNumber] = useState(null);
    const [engagementInternalNote, setEngagementInternalNote] = useState('');
    const [engagementNoteSaving, setEngagementNoteSaving] = useState(false);
    const [engagementQuestionnaireName, setEngagementQuestionnaireName] = useState('');
    const [engagementCustomFieldsDraft, setEngagementCustomFieldsDraft] = useState([]);
    const [selectedEngagementQuestionnaireId, setSelectedEngagementQuestionnaireId] = useState('');
    const [engagementShareLink, setEngagementShareLink] = useState('');
    /** Raw token URLs cannot be recomputed from DB (only hashes stored); keep last issued URL per questionnaire for this session. */
    const engagementStaffShareUrlByQuestionnaireIdRef = useRef({});
    /** True when the opened questionnaire already had an active public link — saves preserve the token unless user regenerates. */
    const [engagementOpenedWithActiveLink, setEngagementOpenedWithActiveLink] = useState(false);

    const [showLeadProposalWizard, setShowLeadProposalWizard] = useState(false);
    const [leadProposalWizardStep, setLeadProposalWizardStep] = useState(1);
    const [leadProposalWizardDraft, setLeadProposalWizardDraft] = useState(null);
    const [leadProposalWizardEditIndex, setLeadProposalWizardEditIndex] = useState(null);
    const [leadProposalWizardSaving, setLeadProposalWizardSaving] = useState(false);
    const [leadProposalWizardUploadBusy, setLeadProposalWizardUploadBusy] = useState(false);
    const [leadProposalMandateUploadBusy, setLeadProposalMandateUploadBusy] = useState(false);
    const [leadProposalWizardHint, setLeadProposalWizardHint] = useState('');
    const [leadProposalWizardCreatingQ, setLeadProposalWizardCreatingQ] = useState(false);
    /** Users list for Step 3 circulation “responsible person” selects */
    const [circulationAssigneeUsers, setCirculationAssigneeUsers] = useState([]);
    const leadProposalWizardSessionDraftIdRef = useRef(null);
    const initialLoadPromiseRef = useRef(null); // Track the Promise.all for initial load
    const initialDataLoadedForClientIdRef = useRef(null); // Track which client we've done initial load for
    const kycRefetchDoneForClientIdRef = useRef(null); // When we refetched KYC for this client (avoid loop)
    
    // Refs for auto-scrolling comments
    const commentsContainerRef = useRef(null);
    const contentScrollableRef = useRef(null);
    
    // Ref for comment textarea to preserve cursor position
    const commentTextareaRef = useRef(null);
    
    // Ref for notes textarea to preserve cursor position
    const notesTextareaRef = useRef(null);
    const notesCursorPositionRef = useRef(null); // Track cursor position to restore after renders
    const isSpacebarPressedRef = useRef(false); // Track if spacebar was just pressed
    
    // Restore cursor position after formData.notes changes - use useLayoutEffect for synchronous restoration
    React.useLayoutEffect(() => {
        if (notesCursorPositionRef.current !== null && notesTextareaRef.current) {
            const pos = notesCursorPositionRef.current;
            const textarea = notesTextareaRef.current;
            // Always restore cursor position if valid
            if (textarea.value.length >= pos) {
                textarea.setSelectionRange(pos, pos);
                textarea.focus();
            }
        }
    }, [formData.notes]);
    
    // CRITICAL: Sync formDataRef with formData so guards can check current values
    useEffect(() => {
        formDataRef.current = formData;
        // Removed excessive logging - only log on actual meaningful changes
    }, [formData]);
    
    // Debounced auto-save: save 2s after last formData change (existing client/lead only)
    const AUTO_SAVE_DELAY_MS = 2000;
    useEffect(() => {
        if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current);
            autoSaveTimeoutRef.current = null;
        }
        // Proposal wizard: mergeLeadEngagementAfterQuestionnaireMutation updates formData; auto-save would call
        // handleSaveLead → lead list refresh / cache churn and repeatedly dismiss or fight the overlay.
        if (showLeadProposalWizard || leadProposalWizardSaving) return;
        if (!formData?.id || typeof onSave !== 'function') return;
        // Only start timer after initial load for this client (avoid saving stale list data)
        if (initialDataLoadedForClientIdRef.current !== formData.id) return;
        autoSaveTimeoutRef.current = setTimeout(() => {
            autoSaveTimeoutRef.current = null;
            const latest = formDataRef.current;
            if (!latest?.id || typeof onSave !== 'function') return;
            if (initialDataLoadedForClientIdRef.current !== latest.id) return;
            if (isAutoSavingRef.current) return;
            if (justSavedRef.current && (Date.now() - saveTimestampRef.current) < 3000) return;
            let unchanged = false;
            try {
                unchanged = lastSavedDataRef.current != null &&
                    JSON.stringify(latest) === JSON.stringify(lastSavedDataRef.current);
            } catch (_) { /* skip compare on circular/special values */ }
            if (unchanged) return;
            isAutoSavingRef.current = true;
            onSave(latest, true).then(() => {
                lastSavedDataRef.current = latest;
                saveTimestampRef.current = Date.now();
                justSavedRef.current = true;
                setTimeout(() => { justSavedRef.current = false; }, 3000);
            }).catch(() => {}).finally(() => {
                isAutoSavingRef.current = false;
            });
        }, AUTO_SAVE_DELAY_MS);
        return () => {
            if (autoSaveTimeoutRef.current) {
                clearTimeout(autoSaveTimeoutRef.current);
                autoSaveTimeoutRef.current = null;
            }
        };
    }, [formData, onSave, showLeadProposalWizard, leadProposalWizardSaving]);

    useEffect(() => {
        if (!showLeadProposalWizard || !isLead) return;
        let cancelled = false;
        void (async () => {
            try {
                const res = window.DatabaseAPI?.getUsers ? await window.DatabaseAPI.getUsers() : null;
                const list =
                    res?.data?.users ||
                    res?.data?.data?.users ||
                    res?.users ||
                    res?.data ||
                    [];
                if (cancelled || !Array.isArray(list)) return;
                const active = list.filter((u) => u && u.status !== 'inactive');
                setCirculationAssigneeUsers(active.length ? active : list);
            } catch (_) {
                if (!cancelled) setCirculationAssigneeUsers([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [showLeadProposalWizard, isLead]);

    const getEngagementQuestionnaires = () => {
        const latest = formDataRef.current || formData;
        return normalizeEngagementQuestionnaires(latest?.customerEngagementQuestionnaires);
    };

    const getEngagementSubmissionVersions = (questionnaireRow) => {
        if (!questionnaireRow || typeof questionnaireRow !== 'object') return [];
        const out = [];
        const submissions = Array.isArray(questionnaireRow.submissions) ? questionnaireRow.submissions : [];
        submissions.forEach((entry, idx) => {
            if (!entry || typeof entry !== 'object') return;
            const submittedAt = entry.submittedAt || null;
            const responses = entry.responses || null;
            if (!submittedAt && !responses) return;
            out.push({
                id: `${questionnaireRow.id || 'q'}-v-${idx + 1}`,
                version: idx + 1,
                submittedAt,
                responses
            });
        });
        if (out.length === 0 && (questionnaireRow.submittedAt || questionnaireRow.responses)) {
            out.push({
                id: `${questionnaireRow.id || 'q'}-v-1`,
                version: 1,
                submittedAt: questionnaireRow.submittedAt || null,
                responses: questionnaireRow.responses || null
            });
        }
        return out;
    };

    const getEngagementReportResponsesAndMeta = (selectedRow, leadFormData, versionNumber) => {
        const versions = getEngagementSubmissionVersions(selectedRow);
        if (versions.length > 0) {
            let pick = null;
            if (versionNumber != null && versionNumber !== '' && !Number.isNaN(Number(versionNumber))) {
                pick = versions.find((x) => x.version === Number(versionNumber)) || null;
            }
            if (!pick) pick = versions[versions.length - 1];
            return {
                responses: pick?.responses ?? null,
                submittedAt: pick?.submittedAt ?? null
            };
        }
        return {
            responses: selectedRow?.responses ?? leadFormData?.customerEngagementResponses ?? null,
            submittedAt: selectedRow?.submittedAt ?? leadFormData?.customerEngagementSubmittedAt ?? null
        };
    };

    const openEngagementPrefillModal = async (clearSubmission, questionnaireRow = null) => {
        if (!formData?.id || !window.DatabaseAPI?.createCustomerEngagementLink) return;
        const hasSubmission = questionnaireRow ? !!questionnaireRow.submittedAt : !!formData.customerEngagementSubmittedAt;
        if (
            clearSubmission &&
            hasSubmission &&
            !window.confirm('Clear the previous submission and open a new questionnaire round?')
        ) {
            return;
        }
        setEngagementOpenedWithActiveLink(!!questionnaireRow?.linkActive);
        setEngagementClearSubmission(clearSubmission);
        setShowEngagementPrefillModal(true);
        setEngagementPrefillLoading(true);
        setEngagementFormDef(null);
        setEngagementBaseFormDef(null);
        setEngagementQuestionnaireName(questionnaireRow?.name || '');
        setSelectedEngagementQuestionnaireId(questionnaireRow?.id || '');
        {
            const qidOpen = String(questionnaireRow?.id || '').trim();
            const remembered =
                qidOpen && engagementStaffShareUrlByQuestionnaireIdRef.current[qidOpen]
                    ? engagementStaffShareUrlByQuestionnaireIdRef.current[qidOpen]
                    : '';
            setEngagementShareLink(remembered);
        }
        try {
            const res = await fetch(`${window.location.origin}/api/public/customer-engagement-form`, { credentials: 'include' });
            const json = await res.json();
            const baseForm = json?.data?.form;
            const customFields = sanitizeEngagementCustomFields(questionnaireRow?.customFields);
            const form = buildEngagementFormWithCustomFields(baseForm, customFields);
            setEngagementBaseFormDef(baseForm || null);
            setEngagementFormDef(form || null);
            const latest = formDataRef.current;
            const storedPrefill = questionnaireRow?.prefill || latest?.customerEngagementPrefill;
            setEngagementPrefillDraft(buildEngagementPrefillDraft(form, storedPrefill, latest?.name));
            setEngagementCustomFieldsDraft(customFields);
        } catch (e) {
            setEngagementHint(e.message || 'Could not load questionnaire');
            setShowEngagementPrefillModal(false);
        } finally {
            setEngagementPrefillLoading(false);
        }
    };

    const commitEngagementLinkFromModal = async ({ copyToClipboard = true, rotateToken = true } = {}) => {
        if (!formData?.id || !window.DatabaseAPI?.createCustomerEngagementLink) return;
        setEngagementBusy(true);
        setEngagementHint('');
        let generatedUrl = '';
        const preserveToken = rotateToken === false;
        try {
            const res = await window.DatabaseAPI.createCustomerEngagementLink(formData.id, {
                clearSubmission: preserveToken ? false : engagementClearSubmission,
                preserveToken,
                prefill: engagementPrefillDraft,
                questionnaireName: engagementQuestionnaireName,
                questionnaireId: selectedEngagementQuestionnaireId || undefined,
                customFields: sanitizeEngagementCustomFields(engagementCustomFieldsDraft)
            });
            const payload = res?.data ?? res;
            if (payload?.preservedToken) {
                setEngagementHint(
                    copyToClipboard
                        ? 'Questionnaire saved. The existing share link is unchanged (use Regenerate to issue a new URL).'
                        : 'Questionnaire saved. The existing share link is unchanged.'
                );
            }
            if (payload?.url) {
                generatedUrl = payload.url;
                setEngagementShareLink(payload.url);
                setEngagementOpenedWithActiveLink(true);
                const sid = String(payload.questionnaireId || selectedEngagementQuestionnaireId || '').trim();
                if (sid) {
                    setSelectedEngagementQuestionnaireId((prev) => prev || sid);
                    engagementStaffShareUrlByQuestionnaireIdRef.current[sid] = payload.url;
                }
                if (copyToClipboard) {
                    try {
                        await navigator.clipboard.writeText(payload.url);
                        setEngagementHint('Questionnaire saved and share link copied.');
                    } catch {
                        setEngagementHint('Questionnaire saved. Share link is ready.');
                    }
                } else if (!payload?.preservedToken) {
                    setEngagementHint('Questionnaire saved. Share link is ready.');
                }
            }
            const r2 = await window.DatabaseAPI.getLead(formData.id);
            const lead = r2?.data?.lead || r2?.lead;
            if (lead) {
                setFormData((prev) => ({
                    ...prev,
                    customerEngagementLinkActive: lead.customerEngagementLinkActive,
                    customerEngagementTokenCreatedAt: lead.customerEngagementTokenCreatedAt,
                    customerEngagementSubmittedAt: lead.customerEngagementSubmittedAt,
                    customerEngagementResponses: lead.customerEngagementResponses,
                    customerEngagementRevokedAt: lead.customerEngagementRevokedAt,
                    customerEngagementPrefill: lead.customerEngagementPrefill,
                    customerEngagementQuestionnaires: lead.customerEngagementQuestionnaires,
                    activityLog:
                        typeof lead.activityLog === 'string'
                            ? JSON.parse(lead.activityLog || '[]')
                            : lead.activityLog || prev.activityLog
                }));
            }
            if (!generatedUrl && !payload?.preservedToken) {
                setEngagementHint(
                    engagementClearSubmission
                        ? 'New link created. Previous submission was cleared.'
                        : 'Link created. Copy and send it to your contact.'
                );
            }
            return generatedUrl;
        } catch (e) {
            setEngagementHint(e.message || 'Could not create link');
            return '';
        } finally {
            setEngagementBusy(false);
            setTimeout(() => setEngagementHint(''), 5000);
        }
    };

    const handleCopyEngagementLinkFromModal = async () => {
        let url = String(engagementShareLink || '').trim();
        if (!url) {
            if (engagementOpenedWithActiveLink) {
                setEngagementHint(
                    'The share URL is not stored after it is created. Use “Regenerate share link” to copy a new link (this invalidates the previous one).'
                );
                setTimeout(() => setEngagementHint(''), 6500);
                return;
            }
            url = await commitEngagementLinkFromModal({ copyToClipboard: false, rotateToken: true });
        }
        if (!url) return;
        try {
            await navigator.clipboard.writeText(url);
            setEngagementHint('Share link copied.');
        } catch {
            setEngagementHint('Could not copy link.');
        }
        setTimeout(() => setEngagementHint(''), 4000);
    };

    const handleEmailEngagementLinkFromModal = async () => {
        let url = String(engagementShareLink || '').trim();
        if (!url) {
            if (engagementOpenedWithActiveLink) {
                setEngagementHint(
                    'Issue a fresh link with “Regenerate share link”, then email it (existing URL is still active but cannot be retrieved here).'
                );
                setTimeout(() => setEngagementHint(''), 6500);
                return;
            }
            url = await commitEngagementLinkFromModal({ copyToClipboard: false, rotateToken: true });
        }
        if (!url) return;
        const subject = encodeURIComponent(`Customer engagement questionnaire: ${engagementQuestionnaireName || 'Site visit'}`);
        const body = encodeURIComponent(
            `Hi,\n\nPlease complete the customer engagement questionnaire using the link below:\n\n${url}\n\nThank you.`
        );
        window.open(`mailto:?subject=${subject}&body=${body}`, '_self');
    };

    const regenerateEngagementShareLink = async () => {
        const rows = getEngagementQuestionnaires();
        const row = selectedEngagementQuestionnaireId
            ? rows.find((q) => String(q.id) === String(selectedEngagementQuestionnaireId))
            : null;
        const hasTokenOutThere = !!(row?.linkActive || engagementOpenedWithActiveLink);
        if (
            hasTokenOutThere &&
            !window.confirm(
                'Regenerate the share link for this questionnaire? Anyone with the previous link will no longer be able to use it.'
            )
        ) {
            return;
        }
        await commitEngagementLinkFromModal({ copyToClipboard: false, rotateToken: true });
    };

    useEffect(() => {
        if (!showEngagementPrefillModal || !engagementBaseFormDef) return;
        const form = buildEngagementFormWithCustomFields(engagementBaseFormDef, engagementCustomFieldsDraft);
        setEngagementFormDef(form);
        setEngagementPrefillDraft((prev) => {
            const next = { ...(prev || {}) };
            for (const sec of form?.sections || []) {
                for (const f of sec.fields || []) {
                    if (f.type === 'fileList') continue;
                    if (!(f.id in next)) {
                        if (f.type === 'checkboxGroup') {
                            const o = {};
                            for (const opt of f.options || []) o[opt.id] = false;
                            next[f.id] = o;
                        } else {
                            next[f.id] = '';
                        }
                    }
                }
            }
            return next;
        });
    }, [showEngagementPrefillModal, engagementBaseFormDef, engagementCustomFieldsDraft]);

    useEffect(() => {
        if (!showEngagementResponsesModal) return;
        let cancelled = false;
        setEngagementReportLoading(true);
        setEngagementReportBranding(null);
        setEngagementReportFormDef(null);
        (async () => {
            try {
                const [bRes, fRes] = await Promise.all([
                    fetch(`${window.location.origin}/api/public/document-branding`, { credentials: 'omit' }),
                    fetch(`${window.location.origin}/api/public/customer-engagement-form`, { credentials: 'omit' })
                ]);
                const bJson = await bRes.json();
                const fJson = await fRes.json();
                if (cancelled) return;
                const selectedRow =
                    getEngagementQuestionnaires().find(
                        (q) => String(q.id || '') === String(selectedEngagementQuestionnaireId || '')
                    ) || null;
                const form = buildEngagementFormWithCustomFields(fJson?.data?.form ?? null, selectedRow?.customFields);
                setEngagementReportBranding(bJson?.data ?? bJson);
                setEngagementReportFormDef(form ?? null);
            } catch {
                if (!cancelled) {
                    setEngagementReportBranding(null);
                    setEngagementReportFormDef(null);
                }
            } finally {
                if (!cancelled) setEngagementReportLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [showEngagementResponsesModal, selectedEngagementQuestionnaireId]);

    useEffect(() => {
        if (!showEngagementResponsesModal) setEngagementReportVersionNumber(null);
    }, [showEngagementResponsesModal]);

    const appendEngagementInternalNote = async () => {
        const text = engagementInternalNote.trim();
        if (!text || typeof onSave !== 'function') return;
        const user = window.storage?.getUser?.() || {};
        const currentUser = {
            name: user?.name || 'System',
            email: user?.email || '',
            id: user?.id || ''
        };
        const activity = {
            id: `ce-int-${Date.now()}`,
            type: 'Customer engagement (internal)',
            description: text,
            timestamp: new Date().toISOString(),
            user: currentUser.name,
            userId: currentUser.id,
            userEmail: currentUser.email,
            relatedId: null,
            meta: { source: 'customer_engagement_report' }
        };
        const base = formDataRef.current || formData;
        const next = { ...base, activityLog: [...(base.activityLog || []), activity] };
        setFormData(next);
        setEngagementInternalNote('');
        setEngagementNoteSaving(true);
        try {
            await onSave(next, true);
        } catch (e) {
            setEngagementHint(e.message || 'Could not save note');
        } finally {
            setEngagementNoteSaving(false);
            setTimeout(() => setEngagementHint(''), 4000);
        }
    };

    const handleEngagementRevoke = async () => {
        if (!formData?.id || !window.DatabaseAPI?.revokeCustomerEngagementLink) return;
        const questionnaireId = selectedEngagementQuestionnaireId || '';
        if (!window.confirm(questionnaireId ? 'Revoke this questionnaire link?' : 'Revoke the public questionnaire link?')) return;
        setEngagementBusy(true);
        setEngagementHint('');
        try {
            await window.DatabaseAPI.revokeCustomerEngagementLink(formData.id, questionnaireId || undefined);
            if (questionnaireId) {
                delete engagementStaffShareUrlByQuestionnaireIdRef.current[String(questionnaireId)];
            } else {
                engagementStaffShareUrlByQuestionnaireIdRef.current = {};
            }
            setEngagementShareLink('');
            const r2 = await window.DatabaseAPI.getLead(formData.id);
            const lead = r2?.data?.lead || r2?.lead;
            if (lead) {
                setFormData((prev) => ({
                    ...prev,
                    customerEngagementLinkActive: lead.customerEngagementLinkActive,
                    customerEngagementTokenCreatedAt: lead.customerEngagementTokenCreatedAt,
                    customerEngagementRevokedAt: lead.customerEngagementRevokedAt,
                    customerEngagementQuestionnaires: lead.customerEngagementQuestionnaires
                }));
            }
            setEngagementHint(questionnaireId ? 'Questionnaire link revoked.' : 'Link revoked.');
        } catch (e) {
            setEngagementHint(e.message || 'Could not revoke');
        } finally {
            setEngagementBusy(false);
            setTimeout(() => setEngagementHint(''), 4000);
        }
    };

    const handleEngagementDelete = async (questionnaireId) => {
        if (!formData?.id || !window.DatabaseAPI?.deleteCustomerEngagementQuestionnaire) return;
        if (!questionnaireId) return;
        if (!window.confirm('Delete this questionnaire permanently? This cannot be undone.')) return;
        setEngagementBusy(true);
        setEngagementHint('');
        try {
            await window.DatabaseAPI.deleteCustomerEngagementQuestionnaire(formData.id, questionnaireId);
            delete engagementStaffShareUrlByQuestionnaireIdRef.current[String(questionnaireId)];
            const r2 = await window.DatabaseAPI.getLead(formData.id);
            const lead = r2?.data?.lead || r2?.lead;
            if (lead) {
                setFormData((prev) => ({
                    ...prev,
                    customerEngagementQuestionnaires: lead.customerEngagementQuestionnaires
                }));
            }
            if (selectedEngagementQuestionnaireId === questionnaireId) {
                setSelectedEngagementQuestionnaireId('');
            }
            setEngagementHint('Questionnaire deleted.');
        } catch (e) {
            setEngagementHint(e.message || 'Could not delete questionnaire');
        } finally {
            setEngagementBusy(false);
            setTimeout(() => setEngagementHint(''), 4000);
        }
    };

    const handleOpenEngagementReport = async (questionnaireId, versionOpt = null) => {
        if (!questionnaireId) return;
        const versionNum =
            versionOpt != null && versionOpt !== '' && !Number.isNaN(Number(versionOpt)) ? Number(versionOpt) : null;
        setSelectedEngagementQuestionnaireId(questionnaireId);
        if (!formData?.id || !window.DatabaseAPI?.getLead) {
            setEngagementReportVersionNumber(versionNum);
            setShowEngagementResponsesModal(true);
            return;
        }
        setEngagementBusy(true);
        try {
            const r2 = await window.DatabaseAPI.getLead(formData.id);
            const lead = r2?.data?.lead || r2?.lead;
            let canOpen = false;
            let selectedRow = null;
            if (lead) {
                const rows = normalizeEngagementQuestionnaires(lead.customerEngagementQuestionnaires);
                selectedRow = rows.find((q) => String(q.id || '') === String(questionnaireId || ''));
                const versionRows = selectedRow ? getEngagementSubmissionVersions(selectedRow) : [];
                const hasVersionedSubmission = versionRows.some((v) => v.responses || v.submittedAt);
                canOpen = !!(
                    selectedRow?.responses ||
                    selectedRow?.submittedAt ||
                    hasVersionedSubmission ||
                    lead.customerEngagementResponses ||
                    lead.customerEngagementSubmittedAt
                );
                setFormData((prev) => ({
                    ...prev,
                    customerEngagementSubmittedAt: lead.customerEngagementSubmittedAt,
                    customerEngagementResponses: lead.customerEngagementResponses,
                    customerEngagementQuestionnaires: lead.customerEngagementQuestionnaires
                }));
            }
            const prefillSnapshot = selectedRow?.prefill && typeof selectedRow.prefill === 'object' && !Array.isArray(selectedRow.prefill)
                ? selectedRow.prefill
                : null;
            const hasPrefillPreview = !!(prefillSnapshot && Object.keys(prefillSnapshot).length > 0);
            if (!canOpen && !hasPrefillPreview) {
                setEngagementHint('No submission or prefill snapshot for this questionnaire yet.');
                setTimeout(() => setEngagementHint(''), 4000);
                return;
            }
            setEngagementReportVersionNumber(versionNum);
            setShowEngagementResponsesModal(true);
        } catch (e) {
            setEngagementHint(e.message || 'Could not load report');
            setTimeout(() => setEngagementHint(''), 4000);
        } finally {
            setEngagementBusy(false);
        }
    };

    // Track last processed client data to detect changes
    const lastClientDataRef = useRef({ followUps: null, notes: null, comments: null, kyc: null, id: null });
    
    // Track when a save just happened to prevent immediate overwriting
    const justSavedRef = useRef(false);
    const saveTimestampRef = useRef(0);
    
    // Hold latest client so sync effect can use it when sync key changes (avoids running on every client ref change)
    const clientPropRef = useRef(client);
    clientPropRef.current = client;
    
    // Stable key so we only run when synced fields actually change – prevents flashing (e.g. External Agent select).
    // Exclude KYC from the key: list/refresh often send unstable KYC refs, causing repeated setFormData and field flashing.
    const clientSyncKey = (() => {
        if (!client || client.id == null) return null;
        const fu = typeof client.followUps === 'string' ? (client.followUps.trim() ? JSON.parse(client.followUps) : []) : (Array.isArray(client.followUps) ? client.followUps : []);
        const notes = client.notes !== undefined && client.notes !== null ? String(client.notes) : '';
        const co = typeof client.comments === 'string' ? (client.comments.trim() ? JSON.parse(client.comments) : []) : (Array.isArray(client.comments) ? client.comments : []);
        return `${client.id}\n${JSON.stringify(fu)}\n${notes}\n${JSON.stringify(co)}`;
    })();
    
    // CRITICAL: Update formData when client prop changes (for followUps, notes, comments persistence)
    // Depends on clientSyncKey so we only run when synced data changes, not on every parent re-render (stops field flashing).
    useEffect(() => {
        const client = clientPropRef.current;
        if (!client || !client.id) return;
        
        // Skip if user is currently editing or auto-saving - don't overwrite their changes
        if (isEditingRef.current || isAutoSavingRef.current) {
            return;
        }
        
        // Skip if user has edited the form - don't overwrite their changes
        if (hasUserEditedForm.current) {
            return;
        }
        
        // CRITICAL: Don't overwrite immediately after a save (within 2 seconds)
        // This prevents the useEffect from overwriting data that was just saved
        const timeSinceSave = Date.now() - saveTimestampRef.current;
        if (justSavedRef.current && timeSinceSave < 2000) {
            console.log('⏸️ Skipping update - save just happened', { timeSinceSave });
            return;
        }
        
        // Only update if client prop has changed (not just a re-render)
        const currentClientId = formDataRef.current?.id;
        if (currentClientId !== client.id) {
            // Different client - reset tracking and let the main useEffect handle it
            lastClientDataRef.current = { followUps: null, notes: null, comments: null, kyc: null, id: client.id };
            justSavedRef.current = false;
            return;
        }
        
        // Parse followUps, notes, comments, and kyc from client prop
        const clientFollowUps = typeof client.followUps === 'string' 
            ? (client.followUps.trim() ? JSON.parse(client.followUps) : [])
            : (Array.isArray(client.followUps) ? client.followUps : []);
        const clientNotes = client.notes !== undefined && client.notes !== null 
            ? String(client.notes) 
            : (formDataRef.current?.notes || '');
        const clientComments = typeof client.comments === 'string' 
            ? (client.comments.trim() ? JSON.parse(client.comments) : [])
            : (Array.isArray(client.comments) ? client.comments : []);
        const clientKyc = (() => {
            if (client.kyc != null && typeof client.kyc === 'object') return client.kyc;
            if (typeof client.kyc === 'string' && client.kyc.trim()) { try { return JSON.parse(client.kyc); } catch (_) {} }
            if (client.kycJsonb != null && typeof client.kycJsonb === 'object') return client.kycJsonb;
            return {};
        })();
        const hasMeaningfulKyc = (k) => {
            if (!k || typeof k !== 'object') return false;
            if (typeof k.clientType === 'string' && k.clientType.trim()) return true;
            const le = k.legalEntity;
            if (le && typeof le === 'object' && typeof le.registeredLegalName === 'string' && le.registeredLegalName.trim()) return true;
            return false;
        };
        
        // CRITICAL: Compare with CURRENT formData, not just last processed data
        // This prevents overwriting data that's already in formData
        const currentFormData = formDataRef.current || {};
        const currentFormFollowUps = currentFormData.followUps || [];
        const currentFormNotes = currentFormData.notes || '';
        const currentFormComments = currentFormData.comments || [];
        const currentFormKyc = currentFormData.kyc || {};
        
        const currentFormFollowUpsStr = JSON.stringify(currentFormFollowUps);
        const currentFormCommentsStr = JSON.stringify(currentFormComments);
        const currentFormKycStr = JSON.stringify(currentFormKyc);
        const clientFollowUpsStr = JSON.stringify(clientFollowUps);
        const clientCommentsStr = JSON.stringify(clientComments);
        const clientKycStr = JSON.stringify(clientKyc);
        
        // Only update if client prop data is DIFFERENT from current formData
        const followUpsDifferent = clientFollowUpsStr !== currentFormFollowUpsStr;
        const notesDifferent = clientNotes !== currentFormNotes;
        const commentsDifferent = clientCommentsStr !== currentFormCommentsStr;
        const kycDifferent = clientKycStr !== currentFormKycStr;
        
        // Also check against last processed data to avoid unnecessary updates
        const lastFollowUpsStr = JSON.stringify(lastClientDataRef.current.followUps);
        const lastNotes = lastClientDataRef.current.notes;
        const lastCommentsStr = JSON.stringify(lastClientDataRef.current.comments);
        const lastKycStr = JSON.stringify(lastClientDataRef.current.kyc);
        
        const followUpsChanged = clientFollowUpsStr !== lastFollowUpsStr;
        const notesChanged = clientNotes !== lastNotes;
        const commentsChanged = clientCommentsStr !== lastCommentsStr;
        const kycChanged = clientKycStr !== lastKycStr;
        
        // Only update if:
        // 1. Client prop data is different from last processed data (to avoid duplicate updates)
        // 2. AND client prop data is different from current formData (to avoid overwriting with same data)
        // 3. For KYC: never overwrite formData.kyc with empty client.kyc when form already has meaningful KYC
        //    (e.g. after loadAllData loaded from GET /api/clients/:id, client prop from list has no kyc)
        const kycOkToOverwrite = !(kycChanged && kycDifferent) || hasMeaningfulKyc(clientKyc) || !hasMeaningfulKyc(currentFormKyc);
        const shouldUpdateKyc = kycChanged && kycDifferent && kycOkToOverwrite;
        if ((followUpsChanged && followUpsDifferent) || (notesChanged && notesDifferent) || (commentsChanged && commentsDifferent) || shouldUpdateKyc) {
            console.log('🔄 Updating formData from client prop (followUps/notes/comments/kyc):', {
                clientId: client.id,
                followUpsChanged: followUpsChanged && followUpsDifferent,
                notesChanged: notesChanged && notesDifferent,
                commentsChanged: commentsChanged && commentsDifferent,
                kycChanged: shouldUpdateKyc,
                followUpsCount: clientFollowUps.length,
                notesLength: clientNotes.length,
                commentsCount: clientComments.length,
                currentFormFollowUpsCount: currentFormFollowUps.length,
                currentFormNotesLength: currentFormNotes.length,
                currentFormCommentsCount: currentFormComments.length
            });
            
            // Update tracking ref
            lastClientDataRef.current = {
                followUps: clientFollowUps,
                notes: clientNotes,
                comments: clientComments,
                kyc: clientKyc,
                id: client.id
            };
            
            setFormData(prev => {
                const updated = {
                    ...prev,
                    ...(followUpsChanged && followUpsDifferent ? { followUps: clientFollowUps } : {}),
                    ...(notesChanged && notesDifferent ? { notes: clientNotes } : {}),
                    ...(commentsChanged && commentsDifferent ? { comments: clientComments } : {}),
                    ...(shouldUpdateKyc ? { kyc: clientKyc } : {})
                };
                formDataRef.current = updated;
                return updated;
            });
        } else {
            // Update tracking ref even if we don't update formData (to prevent future unnecessary updates)
            lastClientDataRef.current = {
                followUps: clientFollowUps,
                notes: clientNotes,
                comments: clientComments,
                kyc: clientKyc,
                id: client.id
            };
        }
    }, [clientSyncKey]);
    
    // Cleanup editing timeout on unmount
    useEffect(() => {
        return () => {
            if (editingTimeoutRef.current) {
                clearTimeout(editingTimeoutRef.current);
            }
        };
    }, []);
    
    // CRITICAL: Completely stop LiveDataSync when modal is open (whether new or existing client)
    // LiveDataSync will ONLY resume when user explicitly saves/closes the form
    // VERSION: v2 - NO RESTART IN CLEANUP (2025-01-06)
    useEffect(() => {
        // Stop LiveDataSync directly if available, regardless of onPauseSync prop
        // This ensures LiveDataSync is stopped even if onPauseSync prop is not passed
        if (window.LiveDataSync && window.LiveDataSync.stop) {
            window.LiveDataSync.stop();
        }
        
        // Also use onPauseSync callback if provided (for parent component coordination)
        // This sets isFormOpenRef to true, providing additional blocking
        if (onPauseSync && typeof onPauseSync === 'function') {
            onPauseSync(true);
        }
        
        // CRITICAL: LiveDataSync will ONLY restart when modal explicitly closes
        // This happens in onClose callback, NOT in cleanup to prevent premature restarts
        // VERSION v2: Removed all LiveDataSync.start() calls from cleanup
        return () => {
            // Don't restart here - only restart when user explicitly closes/saves
            // NO LiveDataSync.start() here - only in onClose callback
        };
    }, []); // Run on mount/unmount only - stop/start based on modal visibility
    
    // Cleanup: Cancel all pending timeouts when component unmounts
    useEffect(() => {
        return () => {
            // Cancel all pending timeouts to prevent API calls after unmount
            pendingTimeoutsRef.current.forEach(timeoutId => {
                clearTimeout(timeoutId);
            });
            pendingTimeoutsRef.current = [];
            // Reset loading flags
            isLoadingContactsRef.current = false;
            isLoadingSitesRef.current = false;
            isLoadingClientRef.current = false;
            isLoadingOpportunitiesRef.current = false;
        };
    }, []);
    
    // Update tab when initialTab prop changes
    // BULLETPROOF: Never overwrite the active tab while we're inline-saving or when we're on a content tab and parent sends overview.
    useEffect(() => {
        if (isAutoSavingRef.current) {
            return;
        }
        // Prefer current user-selected tab over a generic parent "overview" update.
        if (initialTab === 'overview') {
            return;
        }
        if (initialTab === 'overview' && (Date.now() - lastInlineSaveAtRef.current) < TAB_PRESERVE_AFTER_INLINE_SAVE_MS) {
            return;
        }
        // Never revert to overview when we're on contacts/sites/calendar/notes (user or add-flow put us here).
        const contentTabs = ['contacts', 'sites', 'calendar', 'notes'];
        if (initialTab === 'overview' && contentTabs.includes(activeTabRef.current)) {
            return;
        }
        
        let nextTab = initialTab;
        
        // If user tries to access contracts tab but is not admin, default to overview
        if (initialTab === 'contracts' && !canViewContracts) {
            nextTab = 'overview';
        }
        if (initialTab === 'proposals' && !canViewLeadProposals) {
            nextTab = 'overview';
        }
        // Redirect old 'service' or 'maintenance' tabs to combined 'service-maintenance' tab
        if (initialTab === 'service' || initialTab === 'maintenance') {
            nextTab = 'service-maintenance';
        }
        
        // Only update when the incoming initialTab actually changes
        if (nextTab && lastInitialTabRef.current !== nextTab) {
            setActiveTab(nextTab);
            lastInitialTabRef.current = nextTab;
        }
    }, [initialTab, canViewContracts, canViewLeadProposals]);
    
    // Load external agents function
    const loadExternalAgents = useCallback(async () => {
        try {
            const token = window.storage?.getToken?.();
            if (!token) return;
            if (window.RateLimitManager?.isRateLimited?.()) {
                setExternalAgents([]);
                return;
            }
            setIsLoadingExternalAgents(true);
            const response = await fetch('/api/external-agents', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });
            if (response.ok) {
                const data = await response.json();
                const agentsList = data?.data?.externalAgents || data?.externalAgents || [];
                setExternalAgents(agentsList);
            } else if (response.status === 429) {
                const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
                window.RateLimitManager?.setRateLimit?.(retryAfter);
                setExternalAgents([]);
            } else {
                console.error('Failed to load external agents:', response.statusText);
            }
        } catch (error) {
            setExternalAgents([]);
            if (error?.status !== 429 && error?.code !== 'RATE_LIMIT_EXCEEDED') {
                console.error('Error loading external agents:', error);
            }
        } finally {
            setIsLoadingExternalAgents(false);
        }
    }, []);
    
    // Load external agents on mount
    useEffect(() => {
        loadExternalAgents();
    }, [loadExternalAgents]);
    
    // Create new external agent
    const handleCreateExternalAgent = useCallback(async () => {
        if (!newExternalAgentName.trim()) {
            alert('Please enter an external agent name');
            return;
        }
        
        if (!isAdmin) {
            alert('Only administrators can create external agents');
            return;
        }
        
        setIsCreatingExternalAgent(true);
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Authentication required');
                return;
            }
            
            const response = await fetch('/api/external-agents', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    name: newExternalAgentName.trim(),
                    isActive: true
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                const newAgent = data?.data?.externalAgent || data?.externalAgent;
                
                // Reload external agents list
                await loadExternalAgents();
                
                // Select the newly created agent
                if (newAgent && newAgent.id) {
                    setFormData(prev => {
                        const updated = {...prev, externalAgentId: newAgent.id};
                        formDataRef.current = updated;
                        userEditedFieldsRef.current.add('externalAgentId');
                        return updated;
                    });
                    
                    // Auto-save if client exists
                    if (client && client.id && onSave) {
                        setTimeout(async () => {
                            try {
                                const latest = {...formDataRef.current, externalAgentId: newAgent.id};
                                lastSavedDataRef.current = latest;
                                await onSave(latest, true);
                            } catch (error) {
                                console.error('❌ Error saving External Agent:', error);
                            }
                        }, 100);
                    }
                }
                
                // Close modal and reset form
                setShowExternalAgentModal(false);
                setNewExternalAgentName('');
                
                // Show success message
                if (typeof window.showNotification === 'function') {
                    window.showNotification('External agent created successfully', 'success');
                }
            } else {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData?.message || errorData?.error || 'Failed to create external agent';
                alert(errorMessage);
            }
        } catch (error) {
            console.error('Error creating external agent:', error);
            alert('Failed to create external agent. Please try again.');
        } finally {
            setIsCreatingExternalAgent(false);
        }
    }, [newExternalAgentName, isAdmin, loadExternalAgents, client, onSave]);
    
    // Delete external agent
    const handleDeleteExternalAgent = useCallback(async (agentId, agentName) => {
        if (!isAdmin) {
            alert('Only administrators can delete external agents');
            return;
        }
        
        if (!confirm(`Are you sure you want to delete "${agentName}"?\n\nNote: If any leads/clients are using this agent, it will be deactivated instead of deleted.`)) {
            return;
        }
        
        setIsDeletingExternalAgent(true);
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Authentication required');
                return;
            }
            
            const response = await fetch(`/api/external-agents/${agentId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                const message = data?.message || 'External agent deleted successfully';
                
                // Reload external agents list
                await loadExternalAgents();
                
                // If the deleted agent was selected, clear the selection
                setFormData(prev => {
                    if (prev.externalAgentId === agentId) {
                        const updated = {...prev, externalAgentId: null, externalAgent: null};
                        formDataRef.current = updated;
                        return updated;
                    }
                    return prev;
                });
                
                // Show success message
                if (typeof window.showNotification === 'function') {
                    window.showNotification(message, 'success');
                } else {
                    alert(message);
                }
            } else {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData?.message || errorData?.error || 'Failed to delete external agent';
                alert(errorMessage);
            }
        } catch (error) {
            console.error('Error deleting external agent:', error);
            alert('Failed to delete external agent. Please try again.');
        } finally {
            setIsDeletingExternalAgent(false);
        }
    }, [isAdmin, loadExternalAgents]);
    
    // MANUFACTURING PATTERN: Only sync formData when client ID changes (switching to different client)
    // Reset initial loading state when client changes
    useEffect(() => {
        if (client?.id) {
            // Check if client already has complete data - if so, no need for initial loading
            const hasContacts = client.contacts && Array.isArray(client.contacts) && client.contacts.length >= 0;
            const hasSites = client.sites && Array.isArray(client.sites) && client.sites.length >= 0;
            // If client has the expected structure (even if arrays are empty), we can consider it "loaded"
            // Initial loading will be set based on whether we actually need to fetch additional data
        } else {
            // No client - not loading
            setIsInitialLoading(false);
        }
    }, [client?.id]);
    
    // CLEAN SOLUTION: Single useEffect to load all data when client.id changes
    // This replaces the complex competing sync logic with a simple, predictable flow
    useEffect(() => {
        // If no client, reset formData to empty
        if (!client) {
            setIsInitialLoading(false);
            return;
        }
        
        const clientId = client?.id;
        if (!clientId) {
            setIsInitialLoading(false);
            return;
        }
        
        // CRITICAL: Always load data when client.id changes to ensure fresh data
        // Only skip if we're currently loading the SAME client (prevent duplicate calls)
        // Don't skip based on editing state - we want fresh data even if user is editing
        if (isLoadingClientRef.current && initialDataLoadedForClientIdRef.current === clientId) {
            console.log('⏭️ Already loading data for this client, skipping duplicate call');
            return;
        }
        
        // Reset the loaded flag when client changes to ensure we load fresh data
        if (initialDataLoadedForClientIdRef.current !== clientId) {
            initialDataLoadedForClientIdRef.current = null;
        }
        
        // CRITICAL: Don't set loading state - formData already has client prop data
        // This ensures tabs render immediately without waiting for API calls
        // Only mark as loading if formData is empty (new client)
        const hasExistingData = formDataRef.current && (
            (formDataRef.current.contacts && formDataRef.current.contacts.length > 0) ||
            (formDataRef.current.sites && formDataRef.current.sites.length > 0) ||
            (formDataRef.current.opportunities && formDataRef.current.opportunities.length > 0)
        );
        
        if (!hasExistingData) {
            setIsInitialLoading(true);
        }
        isLoadingClientRef.current = true;
        
        // CRITICAL: Load all data immediately when modal opens
        // This ensures all tabs have data available immediately when user switches tabs
        // No deferral - start loading right away
        const loadAllData = async () => {
            try {
                const token = window.storage?.getToken?.();
                if (!token) {
                    console.log('⏭️ Skipping data load - no token');
                    setIsInitialLoading(false);
                    return;
                }
                
                // Refetch full client/lead from API so KYC and other server fields are never stale after refresh
                let clientToUse = client;
                if (clientId) {
                    try {
                        const getOne = isLead
                            ? (window.DatabaseAPI?.getLead || window.api?.getLead)
                            : (window.DatabaseAPI?.getClient || window.api?.getClient);
                        if (typeof getOne === 'function') {
                            // Force fresh fetch for clients so KYC and other server state are correct after reload
                            const res = isLead ? await getOne(clientId) : await getOne(clientId, { forceRefresh: true });
                            const fromApi = isLead
                                ? (res?.data?.lead ?? res?.lead ?? res?.data ?? res)
                                : (res?.data?.client ?? res?.client ?? res?.data ?? res);
                            if (fromApi && fromApi.id === clientId) clientToUse = fromApi;
                        }
                    } catch (_) {
                        // keep clientToUse = client from list
                    }
                }
                
                // Load contacts, sites, and opportunities sequentially to prevent rate limiting
                // Sequential loading allows the rate limiter to properly throttle requests
                const contactsResponse = await window.api.getContacts(clientId).catch(() => ({ data: { contacts: [] } }));
                const contacts = contactsResponse?.data?.contacts || [];
                
                // Small delay between requests to respect rate limits
                await new Promise(resolve => setTimeout(resolve, 100));
                
                const sitesResponse = await window.api.getSites(clientId).catch(() => ({ data: { sites: [] } }));
                const sites = sitesResponse?.data?.sites || [];
                
                // Small delay between requests to respect rate limits
                await new Promise(resolve => setTimeout(resolve, 100));
                
                const opportunitiesResponse = await window.api.getOpportunitiesByClient(clientId).catch(() => ({ data: { opportunities: [] } }));
                const opportunities = opportunitiesResponse?.data?.opportunities || [];
                
                // Parse client data (handle JSON strings); use clientToUse so KYC comes from API after refresh
                const parsedClient = {
                    ...clientToUse,
                    contacts: typeof clientToUse.contacts === 'string' ? JSON.parse(clientToUse.contacts || '[]') : (clientToUse.contacts || []),
                    sites: typeof clientToUse.sites === 'string' ? JSON.parse(clientToUse.sites || '[]') : (clientToUse.sites || []),
                    opportunities: typeof clientToUse.opportunities === 'string' ? JSON.parse(clientToUse.opportunities || '[]') : (clientToUse.opportunities || []),
                    followUps: typeof clientToUse.followUps === 'string' ? JSON.parse(clientToUse.followUps || '[]') : (clientToUse.followUps || []),
                    projectIds: typeof clientToUse.projectIds === 'string' ? JSON.parse(clientToUse.projectIds || '[]') : (clientToUse.projectIds || []),
                    comments: typeof clientToUse.comments === 'string' ? JSON.parse(clientToUse.comments || '[]') : (clientToUse.comments || []),
                    contracts: typeof clientToUse.contracts === 'string' ? JSON.parse(clientToUse.contracts || '[]') : (clientToUse.contracts || []),
                    proposals: typeof clientToUse.proposals === 'string' ? JSON.parse(clientToUse.proposals || '[]') : (Array.isArray(clientToUse.proposals) ? clientToUse.proposals : []),
                    activityLog: typeof clientToUse.activityLog === 'string' ? JSON.parse(clientToUse.activityLog || '[]') : (clientToUse.activityLog || []),
                    services: typeof clientToUse.services === 'string' ? JSON.parse(clientToUse.services || '[]') : (clientToUse.services || []),
                    engagementStage: clientToUse.engagementStage ?? clientToUse.status ?? (isLead ? 'Potential' : undefined),
                    status: isLead ? clientToUse.status : normalizeClientAccountStatus(clientToUse.status ?? clientToUse.engagementStage),
                    aidaStatus: clientToUse.aidaStatus || clientToUse.stage || (isLead ? 'Awareness' : undefined),
                    billingTerms: typeof clientToUse.billingTerms === 'string' ? JSON.parse(clientToUse.billingTerms || '{}') : (clientToUse.billingTerms || {
                        paymentTerms: 'Net 30',
                        billingFrequency: 'Monthly',
                        currency: 'ZAR',
                        retainerAmount: 0,
                        taxExempt: false,
                        notes: ''
                    }),
                    kyc: (() => {
                        if (clientToUse.kyc != null && typeof clientToUse.kyc === 'object') return clientToUse.kyc;
                        if (typeof clientToUse.kyc === 'string' && clientToUse.kyc.trim()) { try { return JSON.parse(clientToUse.kyc); } catch (_) {} }
                        if (clientToUse.kycJsonb != null && typeof clientToUse.kycJsonb === 'object') return clientToUse.kycJsonb;
                        return {};
                    })()
                };
                if (!parsedClient.kyc || typeof parsedClient.kyc !== 'object') parsedClient.kyc = {};
                
                // CRITICAL: Always use API data when available (it's the most up-to-date)
                const currentFormData = formDataRef.current || {};
                const existingContacts = currentFormData.contacts || [];
                const existingSites = currentFormData.sites || [];
                const existingOpportunities = currentFormData.opportunities || [];
                
                // Prioritize API data - it's always more up-to-date
                // Only use existing data if API returned empty and we have existing data
                const finalContacts = contacts.length > 0 ? contacts : (existingContacts.length > 0 ? existingContacts : (parsedClient.contacts || []));
                // CRITICAL: Never overwrite sites with stale API data when user just updated a site (Stage/AIDA).
                // loadAllData can finish after handleUpdateSite; keep the in-memory sites until save has settled.
                const finalSites = (isAutoSavingRef.current && existingSites.length > 0)
                    ? existingSites
                    : (sites.length > 0 ? sites : (existingSites.length > 0 ? existingSites : (parsedClient.sites || [])));
                const finalOpportunities = opportunities.length > 0 ? opportunities : (existingOpportunities.length > 0 ? existingOpportunities : (parsedClient.opportunities || []));
                
                // When we refetched from API (clientToUse !== client), use API KYC as source of truth so
                // persisted KYC is shown after reload. Otherwise merge so in-memory edits are not lost.
                const apiKyc = parsedClient.kyc || {};
                const formKyc = currentFormData.kyc || {};
                const usedFreshApiData = clientToUse != null && clientToUse !== client;
                const mergedKyc = usedFreshApiData
                    ? (parsedClient.kyc || {})
                    : {
                        ...apiKyc,
                        ...formKyc,
                        legalEntity: { ...(apiKyc.legalEntity || {}), ...(formKyc.legalEntity || {}) },
                        businessProfile: { ...(apiKyc.businessProfile || {}), ...(formKyc.businessProfile || {}) },
                        bankingDetails: { ...(apiKyc.bankingDetails || {}), ...(formKyc.bankingDetails || {}) }
                    };
                
                const mergedData = {
                    ...parsedClient,
                    contacts: finalContacts,
                    sites: finalSites,
                    opportunities: finalOpportunities,
                    kyc: mergedKyc,
                    proposals: mergeLeadProposalsPreferringLocal(parsedClient.proposals, currentFormData.proposals)
                };
                
                // CRITICAL: Always update formData immediately when API data arrives
                // This ensures tabs have data available immediately when user switches tabs
                // No conditional checks - just update immediately
                setFormData(mergedData);
                formDataRef.current = mergedData;
                lastSavedDataRef.current = mergedData; // so auto-save doesn't run right after load
                
                // Mark as loaded
                initialDataLoadedForClientIdRef.current = clientId;
                lastProcessedClientRef.current = clientToUse;
                
            } catch (error) {
                console.error('❌ Error loading client data:', error);
            } finally {
                setIsInitialLoading(false);
                isLoadingClientRef.current = false;
            }
        };
        
        // CRITICAL: Load ALL data immediately when client modal opens
        // This ensures all tabs have data available immediately when user switches tabs
        // formData is already initialized with client prop data, so tabs render immediately
        // API data will update formData immediately when it arrives (no transition delay)
        // Start loading immediately - don't wait for anything
        loadAllData().catch(error => {
            console.error('❌ Error in loadAllData:', error);
            setIsInitialLoading(false);
            isLoadingClientRef.current = false;
        });
        
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client?.id]); // Only reload when client.id changes
    
    // Track previous client ID to detect when a new client gets an ID after save
    const previousClientIdRef = useRef(client?.id || null);
    
    // Reset typing flag when switching to different client
    // BUT: Don't reset if we're saving a new client (null -> ID) and user is typing
    // CRITICAL: NEVER reset if user has edited fields - preserve them permanently
    useEffect(() => {
        const currentClientId = client?.id || null;
        const previousClientId = previousClientIdRef.current;
        const currentFormDataId = formDataRef.current?.id || null;
        
        // CRITICAL: NEVER reset if user has edited any fields
        if (userEditedFieldsRef.current.size > 0) {
            previousClientIdRef.current = currentClientId;
            return; // Don't reset anything if user has edited fields
        }
        
        // If switching to a completely different client (different ID), reset typing flag
        if (currentClientId && currentClientId !== currentFormDataId && currentClientId !== previousClientId) {
            // Only reset if it's truly a different client (not the same client getting an ID)
            const isSameClientGettingId = !previousClientId && currentClientId && userHasStartedTypingRef.current;
            if (!isSameClientGettingId) {
                userHasStartedTypingRef.current = false;
            } else {
            }
        }
        
        previousClientIdRef.current = currentClientId;
    }, [client?.id]);
    
    // Handle tab change and notify parent
    const handleTabChange = async (tab) => {
        // Prevent non-admins from accessing contracts tab
        if (tab === 'contracts' && !canViewContracts) {
            return;
        }
        if (tab === 'proposals' && !canViewLeadProposals) {
            return;
        }
        // Redirect old 'service' or 'maintenance' tabs to combined 'service-maintenance' tab
        if (tab === 'service' || tab === 'maintenance') {
            tab = 'service-maintenance';
        }
        // Keep ref in sync so "revert to overview" guards can see we're on a content tab
        activeTabRef.current = tab;
        // CRITICAL: When leaving KYC tab, persist KYC via dedicated API first, then full onSave.
        // Dedicated PATCH /api/clients/:id/kyc ensures KYC is in DB before refresh regardless of full-save path.
        if (activeTab === 'kyc' && tab !== 'kyc') {
            const clientId = formData?.id || client?.id;
            const raw = formDataRef.current || formData;
            const kycFromRaw = (raw?.kyc != null && typeof raw.kyc === 'object') ? raw.kyc : (typeof raw?.kyc === 'string' && raw.kyc ? (() => { try { return JSON.parse(raw.kyc); } catch (_) { return {}; } })() : {});
            const kycFromForm = (raw?.kyc != null && typeof raw.kyc === 'object') ? raw.kyc : (typeof raw?.kyc === 'string' && raw.kyc ? (() => { try { return JSON.parse(raw.kyc); } catch (_) { return {}; } })() : {});
            const kycToSend = {
                ...kycFromRaw,
                ...kycFromForm,
                legalEntity: { ...(kycFromRaw.legalEntity || {}), ...(kycFromForm.legalEntity || {}) },
                businessProfile: { ...(kycFromRaw.businessProfile || {}), ...(kycFromForm.businessProfile || {}) },
                bankingDetails: { ...(kycFromRaw.bankingDetails || {}), ...(kycFromForm.bankingDetails || {}) }
            };
            const latest = raw ? { ...raw, kyc: kycToSend } : null;
            const saveKyc = (window.DatabaseAPI?.saveClientKyc || window.api?.saveClientKyc);
            if (clientId && typeof saveKyc === 'function') {
                try {
                    await saveKyc(clientId, kycToSend);
                } catch (_) {
                    // Non-blocking; full onSave below may still persist via main PATCH
                }
            }
            if (latest && typeof onSave === 'function') {
                try {
                    await onSave(latest, true);
                } catch (_) {}
            }
        }
        setActiveTab(tab);
        if (onTabChange) {
            onTabChange(tab);
        }
        // When switching TO KYC tab: if form has no meaningful KYC but we have a client id,
        // refetch the client so persisted KYC from DB is shown (e.g. after refresh or slow initial load).
        if (tab === 'kyc' && !isLead) {
            const clientId = formData?.id || client?.id;
            const k = (formDataRef.current || formData)?.kyc || {};
            const hasKyc = (k.clientType && String(k.clientType).trim()) || (k.legalEntity?.registeredLegalName && String(k.legalEntity.registeredLegalName).trim());
            if (clientId && !hasKyc) {
                const getOne = window.DatabaseAPI?.getClient || window.api?.getClient;
                if (typeof getOne === 'function') {
                    getOne(clientId, { forceRefresh: true })
                        .then((res) => {
                            const fromApi = res?.data?.client ?? res?.client ?? res?.data ?? res;
                            if (fromApi && fromApi.id === clientId) {
                                const apiKyc = (fromApi.kyc != null && typeof fromApi.kyc === 'object') ? fromApi.kyc
                                    : (typeof fromApi.kyc === 'string' && fromApi.kyc.trim()) ? (() => { try { return JSON.parse(fromApi.kyc); } catch (_) { return {}; } })()
                                    : (fromApi.kycJsonb != null && typeof fromApi.kycJsonb === 'object') ? fromApi.kycJsonb : {};
                                if ((apiKyc.clientType && String(apiKyc.clientType).trim()) || (apiKyc.legalEntity?.registeredLegalName && String(apiKyc.legalEntity.registeredLegalName).trim())) {
                                    setFormData(prev => {
                                        const next = { ...prev, kyc: { ...(prev.kyc || {}), ...apiKyc, legalEntity: { ...(prev.kyc?.legalEntity || {}), ...(apiKyc.legalEntity || {}) }, businessProfile: { ...(prev.kyc?.businessProfile || {}), ...(apiKyc.businessProfile || {}) }, bankingDetails: { ...(prev.kyc?.bankingDetails || {}), ...(apiKyc.bankingDetails || {}) } } };
                                        formDataRef.current = next;
                                        return next;
                                    });
                                }
                            }
                        })
                        .catch(() => {});
                }
            }
        }
        // Persist tab selection to localStorage (per client)
        if (client?.id) {
            try {
                const tabKey = `client-tab-${client.id}`;
                localStorage.setItem(tabKey, tab);
            } catch (e) {
                console.warn('⚠️ Failed to save tab to localStorage:', e);
            }
        }
    };
    
    // Close handler: when on KYC tab, persist via dedicated KYC API then onSave, then close.
    const handleClose = () => {
        if (activeTab === 'kyc') {
            const clientId = formData?.id || client?.id;
            const raw = formDataRef.current || formData;
            const kycFromRaw = (raw?.kyc != null && typeof raw.kyc === 'object') ? raw.kyc : (typeof raw?.kyc === 'string' && raw.kyc ? (() => { try { return JSON.parse(raw.kyc); } catch (_) { return {}; } })() : {});
            const kycFromForm = (raw?.kyc != null && typeof raw.kyc === 'object') ? raw.kyc : (typeof raw?.kyc === 'string' && raw.kyc ? (() => { try { return JSON.parse(raw.kyc); } catch (_) { return {}; } })() : {});
            const kycToSend = {
                ...kycFromRaw,
                ...kycFromForm,
                legalEntity: { ...(kycFromRaw.legalEntity || {}), ...(kycFromForm.legalEntity || {}) },
                businessProfile: { ...(kycFromRaw.businessProfile || {}), ...(kycFromForm.businessProfile || {}) },
                bankingDetails: { ...(kycFromRaw.bankingDetails || {}), ...(kycFromForm.bankingDetails || {}) }
            };
            const latest = raw ? { ...raw, kyc: kycToSend } : null;
            const saveKyc = (window.DatabaseAPI?.saveClientKyc || window.api?.saveClientKyc);
            const doClose = () => { if (onClose) onClose(); };
            if (clientId && typeof saveKyc === 'function') {
                saveKyc(clientId, kycToSend).catch(() => {}).then(() => {
                    if (latest && typeof onSave === 'function') {
                        onSave(latest, true).catch(() => {}).finally(doClose);
                    } else {
                        doClose();
                    }
                });
                return;
            }
            if (latest && typeof onSave === 'function') {
                onSave(latest, true).finally(doClose);
                return;
            }
        }
        if (onClose) onClose();
    };
    
    const setLeadProposals = (nextProposals) => {
        const list = Array.isArray(nextProposals) ? nextProposals : [];
        setFormData(prev => {
            const n = { ...prev, proposals: list };
            formDataRef.current = n;
            return n;
        });
        hasUserEditedForm.current = true;
    };
    const handleRemoveLeadProposal = (index) => {
        if (!confirm('Remove this proposal from the lead?')) return;
        const list = [...(Array.isArray(formDataRef.current?.proposals) ? formDataRef.current.proposals : [])];
        list.splice(index, 1);
        setLeadProposals(list);
    };

    const mergeLeadEngagementAfterQuestionnaireMutation = async () => {
        if (!formData?.id || !window.DatabaseAPI?.getLead) return;
        const r2 = await window.DatabaseAPI.getLead(formData.id);
        const lead = r2?.data?.lead || r2?.lead;
        if (!lead) return;
        setFormData((prev) => {
            const next = {
                ...prev,
                customerEngagementLinkActive: lead.customerEngagementLinkActive,
                customerEngagementTokenCreatedAt: lead.customerEngagementTokenCreatedAt,
                customerEngagementSubmittedAt: lead.customerEngagementSubmittedAt,
                customerEngagementResponses: lead.customerEngagementResponses,
                customerEngagementRevokedAt: lead.customerEngagementRevokedAt,
                customerEngagementPrefill: lead.customerEngagementPrefill,
                customerEngagementQuestionnaires: lead.customerEngagementQuestionnaires,
                activityLog:
                    typeof lead.activityLog === 'string'
                        ? JSON.parse(lead.activityLog || '[]')
                        : lead.activityLog || prev.activityLog
            };
            formDataRef.current = next;
            return next;
        });
    };

    /** Proposal wizard Step 1: refresh questionnaire rows from API so submissions match the server (public submissions do not push to this modal). */
    useEffect(() => {
        if (!showLeadProposalWizard || leadProposalWizardStep !== 1 || !formData?.id || !isLead) return;
        void mergeLeadEngagementAfterQuestionnaireMutation();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh only when wizard step/id gates change (omit merge fn to avoid loops)
    }, [showLeadProposalWizard, leadProposalWizardStep, formData?.id, isLead]);

    /** Creates a new questionnaire row on the lead (never reuses an existing one). */
    const createFreshQuestionnaireForProposal = async (titleHint) => {
        if (!formData?.id || !window.DatabaseAPI?.createCustomerEngagementLink) {
            throw new Error('Cannot create questionnaire');
        }
        const trimmed = String(titleHint || '').trim();
        const questionnaireName = trimmed
            ? `${trimmed} — customer engagement`
            : `Customer engagement — ${new Date().toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' })}`;
        const res = await window.DatabaseAPI.createCustomerEngagementLink(formData.id, {
            questionnaireName,
            clearSubmission: false
        });
        const payload = res?.data ?? res;
        const qid = payload?.questionnaireId;
        if (!qid) throw new Error('No questionnaire id returned');
        if (payload?.url) {
            engagementStaffShareUrlByQuestionnaireIdRef.current[String(qid)] = payload.url;
        }
        await mergeLeadEngagementAfterQuestionnaireMutation();
        return String(qid);
    };

    const openLeadProposalWizardCreate = () => {
        if (!canManageLeadProposals) return;
        if (!formData?.id) return;
        setLeadProposalWizardEditIndex(null);
        setLeadProposalWizardStep(1);
        setLeadProposalWizardHint('');
        const draftId = `lp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        leadProposalWizardSessionDraftIdRef.current = draftId;
        setLeadProposalWizardDraft({
            id: draftId,
            title: '',
            amount: 0,
            status: 'Draft',
            workingDocumentLink: '',
            notes: '',
            createdDate: new Date().toISOString(),
            expiryDate: null,
            workflow: defaultLeadProposalWorkflow()
        });
        setShowLeadProposalWizard(true);
        const runQuestionnaireBootstrap = () => {
            setLeadProposalWizardCreatingQ(true);
            void (async () => {
                try {
                    const qid = await createFreshQuestionnaireForProposal('');
                    setLeadProposalWizardDraft((prev) => {
                        if (!prev || prev.id !== leadProposalWizardSessionDraftIdRef.current) return prev;
                        const w = normalizeLeadProposalWorkflowUi(prev.workflow);
                        return {
                            ...prev,
                            workflow: { ...w, engagementQuestionnaireId: qid }
                        };
                    });
                    setSelectedEngagementQuestionnaireId(qid);
                } catch (e) {
                    setLeadProposalWizardHint(e.message || 'Could not create questionnaire. Try again or close and reopen.');
                } finally {
                    setLeadProposalWizardCreatingQ(false);
                }
            })();
        };
        // Defer until after paint so the wizard mounts first; immediate POST clears /leads cache and can race parent list refresh + remount.
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(() => {
                window.requestAnimationFrame(runQuestionnaireBootstrap);
            });
        } else {
            setTimeout(runQuestionnaireBootstrap, 0);
        }
    };

    const openLeadProposalWizardEdit = (index) => {
        const list = Array.isArray(formDataRef.current?.proposals) ? formDataRef.current.proposals : [];
        const row = list[index];
        if (!row) return;
        setLeadProposalWizardEditIndex(index);
        setLeadProposalWizardStep(normalizeLeadProposalWorkflowUi(row.workflow).currentStep || 1);
        setLeadProposalWizardHint('');
        setLeadProposalWizardDraft({
            ...row,
            workflow: normalizeLeadProposalWorkflowUi(row.workflow)
        });
        setShowLeadProposalWizard(true);
    };

    const closeLeadProposalWizard = () => {
        if (leadProposalWizardSaving) return;
        leadProposalWizardSessionDraftIdRef.current = null;
        setShowLeadProposalWizard(false);
        setLeadProposalWizardDraft(null);
        setLeadProposalWizardEditIndex(null);
        setLeadProposalWizardStep(1);
        setLeadProposalWizardHint('');
        setLeadProposalWizardCreatingQ(false);
    };

    const updateLeadProposalWizardWorkflow = (partial) => {
        setLeadProposalWizardDraft((prev) => {
            if (!prev) return prev;
            const w = normalizeLeadProposalWorkflowUi(prev.workflow);
            return { ...prev, workflow: { ...w, ...partial } };
        });
    };

    const updateCirculationDepartment = (deptKey, partial) => {
        setLeadProposalWizardDraft((prev) => {
            if (!prev) return prev;
            const w = normalizeLeadProposalWorkflowUi(prev.workflow);
            const cd = normalizeCirculationDepartmentsUi(w);
            cd[deptKey] = { ...(cd[deptKey] || { comment: '', responsibleUserId: '' }), ...partial };
            return { ...prev, workflow: { ...w, circulationDepartments: cd } };
        });
    };

    const saveLeadProposalWizard = async () => {
        const draft = leadProposalWizardDraft;
        if (!draft || !String(draft.title || '').trim()) {
            setLeadProposalWizardHint('Add a proposal title before saving.');
            return;
        }
        setLeadProposalWizardSaving(true);
        setLeadProposalWizardHint('');
        try {
            const normalized = {
                ...draft,
                workflow: normalizeLeadProposalWorkflowUi(draft.workflow)
            };
            const list = [...(Array.isArray(formDataRef.current?.proposals) ? formDataRef.current.proposals : [])];
            if (leadProposalWizardEditIndex != null && list[leadProposalWizardEditIndex]) {
                list[leadProposalWizardEditIndex] = normalized;
            } else {
                list.push(normalized);
            }
            const base = formDataRef.current || formData;
            const toSave = { ...base, proposals: list };
            formDataRef.current = toSave;
            setFormData(toSave);
            hasUserEditedForm.current = true;
            if (typeof onSave === 'function') {
                await onSave(toSave, true);
            }
            const fd = formDataRef.current || toSave;
            const leadId = fd?.id;
            if (leadId && isLead) {
                await mergeLeadEngagementAfterQuestionnaireMutation();
                /* Circulation assignee email + in-app notifications are sent server-side when proposals persist (PATCH lead). */
            }
            setShowLeadProposalWizard(false);
            setLeadProposalWizardDraft(null);
            setLeadProposalWizardEditIndex(null);
            setLeadProposalWizardStep(1);
        } catch (e) {
            setLeadProposalWizardHint(e.message || 'Could not save proposal.');
        } finally {
            setLeadProposalWizardSaving(false);
        }
    };

    const uploadLeadProposalWorkingFile = async (file) => {
        if (!file) return;
        setLeadProposalWizardUploadBusy(true);
        setLeadProposalWizardHint('');
        try {
            const reader = new FileReader();
            const dataUrl = await new Promise((resolve, reject) => {
                reader.onload = (ev) => resolve(ev.target.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            const token = window.storage?.getToken?.();
            const res = await fetch(`${window.location.origin}/api/files`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    folder: 'lead-proposals',
                    name: file.name,
                    dataUrl
                })
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(json.error?.message || json.message || `Upload failed (${res.status})`);
            }
            const fileUrl = json.data?.url || json.url;
            if (!fileUrl) throw new Error('No file URL returned');
            const abs = fileUrl.startsWith('http')
                ? fileUrl
                : `${window.location.origin.replace(/\/$/, '')}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`;
            setLeadProposalWizardDraft((prev) => {
                if (!prev) return prev;
                const w = normalizeLeadProposalWorkflowUi(prev.workflow);
                return {
                    ...prev,
                    workingDocumentLink: abs,
                    workflow: { ...w, workingDraftUploadedName: file.name }
                };
            });
            setLeadProposalWizardHint('File uploaded — shown above as a document.');
            setTimeout(() => setLeadProposalWizardHint(''), 4000);
        } catch (e) {
            setLeadProposalWizardHint(e.message || 'Upload failed.');
        } finally {
            setLeadProposalWizardUploadBusy(false);
        }
    };

    const uploadLeadProposalManualMandateFile = async (file) => {
        if (!file) return;
        setLeadProposalMandateUploadBusy(true);
        setLeadProposalWizardHint('');
        try {
            const reader = new FileReader();
            const dataUrl = await new Promise((resolve, reject) => {
                reader.onload = (ev) => resolve(ev.target.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            const token = window.storage?.getToken?.();
            const res = await fetch(`${window.location.origin}/api/files`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    folder: 'lead-engagement-mandates',
                    name: file.name,
                    dataUrl
                })
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(json.error?.message || json.message || `Upload failed (${res.status})`);
            }
            const fileUrl = json.data?.url || json.url;
            if (!fileUrl) throw new Error('No file URL returned');
            const abs = fileUrl.startsWith('http')
                ? fileUrl
                : `${window.location.origin.replace(/\/$/, '')}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`;
            setLeadProposalWizardDraft((prev) => {
                if (!prev) return prev;
                const wf = normalizeLeadProposalWorkflowUi(prev.workflow);
                return {
                    ...prev,
                    workflow: {
                        ...wf,
                        manualEngagementMandateLink: abs,
                        manualEngagementMandateUploadedName: file.name
                    }
                };
            });
            setLeadProposalWizardHint('Manual mandate file attached.');
            setTimeout(() => setLeadProposalWizardHint(''), 4000);
        } catch (e) {
            setLeadProposalWizardHint(e.message || 'Upload failed.');
        } finally {
            setLeadProposalMandateUploadBusy(false);
        }
    };

    const goLeadProposalWizardStep = (next) => {
        const s = Math.min(4, Math.max(1, next));
        setLeadProposalWizardStep(s);
        setLeadProposalWizardDraft((prev) => {
            if (!prev) return prev;
            const w = normalizeLeadProposalWorkflowUi(prev.workflow);
            return { ...prev, workflow: { ...w, currentStep: s } };
        });
    };

    // Job cards state - MUST be declared before loadJobCards function
    const [jobCards, setJobCards] = useState([]);
    const [loadingJobCards, setLoadingJobCards] = useState(false);
    const [incidentReports, setIncidentReports] = useState([]);
    const [loadingIncidentReports, setLoadingIncidentReports] = useState(false);
    
    // Refs to prevent duplicate loading calls - MUST be declared before loadJobCards function
    const isLoadingJobCardsRef = useRef(false);
    const lastLoadedClientIdRef = useRef(null);
    const lastLoadedClientNameRef = useRef(null);
    const jobCardsRef = useRef([]); // Ref to track current jobCards without causing re-renders
    
    // Load job cards for this client - MUST be defined before useEffect hooks that use it
    const loadJobCards = useCallback(async () => {
        if (!client?.id) {
            setJobCards([]);
            jobCardsRef.current = [];
            lastLoadedClientIdRef.current = null;
            lastLoadedClientNameRef.current = null;
            return Promise.resolve([]);
        }
        
        const clientId = String(client.id);
        const clientName = client?.name || null;
        
        // Prevent duplicate calls: if already loading, return empty array (will be handled by deduplicator)
        if (isLoadingJobCardsRef.current) {
            return jobCardsRef.current || [];
        }
        
        // Only check clientId, not name - name changes shouldn't trigger reload
        // If lastLoadedClientIdRef is null, it means we're doing an initial load - always proceed
        // Otherwise, if same client already loaded, skip
        if (lastLoadedClientIdRef.current === clientId && lastLoadedClientIdRef.current !== null) {
            // Same client already loaded, return existing job cards from ref
            return jobCardsRef.current || [];
        }
        
        const token = window.storage?.getToken?.();
        if (!token) {
            setLoadingJobCards(false);
            isLoadingJobCardsRef.current = false;
            return [];
        }
        
        // Use global request deduplication to prevent duplicate API calls
        const requestKey = window.RequestDeduplicator?.getRequestKey('/api/jobcards', { clientId, pageSize: 1000 });
        
        try {
            // Use deduplicator if available
            if (window.RequestDeduplicator) {
                await window.RequestDeduplicator.deduplicate(requestKey, async () => {
                    isLoadingJobCardsRef.current = true;
                    setLoadingJobCards(true);
                    
                    try {
                        // First, try fetching by clientId (most reliable)
                        let response = await fetch(`/api/jobcards?clientId=${encodeURIComponent(clientId)}&pageSize=1000`, {
                            headers: { 
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            }
                        });
                        
                        let data = null;
                        
                        if (response.ok) {
                            data = await response.json();
                            const jobCards = data.jobCards || data.data?.jobCards || [];
                            if (jobCards.length > 0) {
                                setJobCards(jobCards);
                                jobCardsRef.current = jobCards; // Update ref
                                lastLoadedClientIdRef.current = clientId;
                                lastLoadedClientNameRef.current = clientName;
                                setLoadingJobCards(false);
                                isLoadingJobCardsRef.current = false;
                                return { jobCards };
                            }
                        }
                        
                        // No broad fallback query here: fetching all job cards is expensive
                        // and makes client detail open slowly on desktop.
                        setJobCards([]);
                        jobCardsRef.current = [];
                        lastLoadedClientIdRef.current = clientId;
                        lastLoadedClientNameRef.current = clientName;
                        return { jobCards: [] };
                    } catch (error) {
                        console.error('Error loading job cards:', error);
                        setJobCards([]);
                        jobCardsRef.current = []; // Update ref
                        throw error;
                    } finally {
                        setLoadingJobCards(false);
                        isLoadingJobCardsRef.current = false;
                    }
                }, 2000); // 2 second deduplication window
            } else {
                // Fallback to original logic if RequestDeduplicator is not available
                isLoadingJobCardsRef.current = true;
                setLoadingJobCards(true);
                
                try {
                    let response = await fetch(`/api/jobcards?clientId=${encodeURIComponent(clientId)}&pageSize=1000`, {
                        headers: { 
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    let data = null;
                    
                    if (response.ok) {
                        data = await response.json();
                        const jobCards = data.jobCards || data.data?.jobCards || [];
                        if (jobCards.length > 0) {
                            setJobCards(jobCards);
                            jobCardsRef.current = jobCards; // Update ref
                            lastLoadedClientIdRef.current = clientId;
                            lastLoadedClientNameRef.current = clientName;
                            setLoadingJobCards(false);
                            isLoadingJobCardsRef.current = false;
                            return { jobCards };
                        }
                    }
                    
                    setJobCards([]);
                    jobCardsRef.current = []; // Update ref
                    lastLoadedClientIdRef.current = clientId;
                    lastLoadedClientNameRef.current = clientName;
                    setLoadingJobCards(false);
                    isLoadingJobCardsRef.current = false;
                    return { jobCards: [] };
                } catch (error) {
                    console.error('Error loading job cards:', error);
                    setJobCards([]);
                    jobCardsRef.current = []; // Update ref
                    setLoadingJobCards(false);
                    isLoadingJobCardsRef.current = false;
                    throw error;
                }
            }
        } catch (error) {
            // Error already handled in the inner try-catch
            setLoadingJobCards(false);
            isLoadingJobCardsRef.current = false;
            return jobCardsRef.current || [];
        }
    }, [client?.id]); // FIXED: Removed jobCards from deps to prevent infinite loop
    
    // Reload job cards when Service & Maintenance tab is opened
    useEffect(() => {
        if (activeTab === 'service-maintenance' && client?.id) {
            // Force reload by resetting the ref, then load
            const originalLoadedClientId = lastLoadedClientIdRef.current;
            lastLoadedClientIdRef.current = null;
            loadJobCards().finally(() => {
                // If loadJobCards didn't set the ref (e.g., error), restore original
                if (lastLoadedClientIdRef.current === null) {
                    lastLoadedClientIdRef.current = originalLoadedClientId;
                }
            });
        }
    }, [activeTab, client?.id, loadJobCards]);

    // REMOVED: Auto-restore saved tab from localStorage
    // Clients and leads should always default to 'overview' when opened, not restore the last tab
    // Tab selection is still saved to localStorage for other purposes, but not auto-restored on open
    
    // Reset to 'overview' when client/lead ID changes (opening a different entity).
    // BULLETPROOF: Skip entirely while inline-saving or in the preserve window so we never revert to Overview mid-save.
    useEffect(() => {
        if (isAutoSavingRef.current) {
            return;
        }
        if ((Date.now() - lastInlineSaveAtRef.current) < TAB_PRESERVE_AFTER_INLINE_SAVE_MS) {
            return;
        }
        const currentClientId = client?.id;
        const previousClientId = previousClientIdRef.current;
        
        // Only reset if we're switching to a different client/lead
        if (currentClientId && currentClientId !== previousClientId) {
            // Use initialTab when parent passed a content tab (e.g. 'sites' when opening from leads list site click)
            // so we don't jump to overview after navigating to a site
            const shouldUseInitialTab = initialTab && initialTab !== 'overview';
            
            if (shouldUseInitialTab) {
                // URL explicitly requested a tab - respect it
                const tab = initialTab;
                setActiveTab(tab);
                activeTabRef.current = tab;
                if (onTabChange) {
                    onTabChange(tab);
                }
            } else {
                // Default to 'overview' when opening a new client/lead
                setActiveTab('overview');
                activeTabRef.current = 'overview';
                if (onTabChange) {
                    onTabChange('overview');
                }
            }
            
            previousClientIdRef.current = currentClientId;
        } else if (currentClientId) {
            // Same client, just update the ref
            previousClientIdRef.current = currentClientId;
        }
    }, [client?.id, initialTab, onTabChange]); // Run when client ID or initialTab changes
    
    // When KYC tab is visible, always fetch client from API once per client so persisted KYC shows after refresh.
    useEffect(() => {
        if (activeTab !== 'kyc' || isLead || !client?.id) return;
        const clientId = String(client.id);
        if (kycRefetchDoneForClientIdRef.current === clientId) return;
        kycRefetchDoneForClientIdRef.current = clientId;

        const applyKycFromApi = (fromApi) => {
            if (!fromApi || String(fromApi.id) !== clientId) return;
            const apiKyc = (fromApi.kyc != null && typeof fromApi.kyc === 'object') ? fromApi.kyc
                : (typeof fromApi.kyc === 'string' && fromApi.kyc.trim()) ? (() => { try { return JSON.parse(fromApi.kyc); } catch (_) { return {}; } })()
                : (fromApi.kycJsonb != null && typeof fromApi.kycJsonb === 'object') ? fromApi.kycJsonb : {};
            const hasApiKyc = (apiKyc.clientType && String(apiKyc.clientType).trim()) || (apiKyc.legalEntity?.registeredLegalName && String(apiKyc.legalEntity.registeredLegalName || '').trim());
            if (!hasApiKyc) return;
            setFormData(prev => {
                const next = {
                    ...prev,
                    kyc: {
                        ...(prev.kyc || {}),
                        ...apiKyc,
                        legalEntity: { ...(prev.kyc?.legalEntity || {}), ...(apiKyc.legalEntity || {}) },
                        businessProfile: { ...(prev.kyc?.businessProfile || {}), ...(apiKyc.businessProfile || {}) },
                        bankingDetails: { ...(prev.kyc?.bankingDetails || {}), ...(apiKyc.bankingDetails || {}) }
                    }
                };
                formDataRef.current = next;
                return next;
            });
        };

        const doFetch = () => {
            const apiBase = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : '';
            const token = (typeof window !== 'undefined' && window.storage?.getToken) ? window.storage.getToken() : null;
            return fetch(`${apiBase}/api/clients/${clientId}`, {
                method: 'GET',
                headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
                credentials: 'include'
            })
                .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
                .then((json) => {
                    const fromApi = json?.data?.client ?? json?.client ?? json?.data ?? json;
                    applyKycFromApi(fromApi);
                });
        };
        const getOne = window.DatabaseAPI?.getClient || window.api?.getClient;
        if (typeof getOne === 'function') {
            getOne(clientId, { forceRefresh: true })
                .then((res) => {
                    const fromApi = res?.data?.client ?? res?.client ?? res?.data ?? res;
                    applyKycFromApi(fromApi);
                })
                .catch(() => {
                    kycRefetchDoneForClientIdRef.current = null;
                    doFetch().catch(() => { kycRefetchDoneForClientIdRef.current = null; });
                });
        } else {
            doFetch().catch(() => { kycRefetchDoneForClientIdRef.current = null; });
        }
    }, [activeTab, client?.id, isLead]);
    
    // Reset kycRefetchDone when client changes so we can refetch for the new client
    useEffect(() => {
        if (!client?.id) kycRefetchDoneForClientIdRef.current = null;
    }, [client?.id]);
    
    // Auto-scroll to last comment when notes tab is opened
    useEffect(() => {
        // Defensive check: ensure formData is initialized before accessing it
        if (!formData) return;
        
        if (activeTab === 'notes' && commentsContainerRef.current && formData && formData.comments && formData.comments.length > 0) {
            // Small delay to ensure DOM is ready
            setTimeout(() => {
                // Scroll the parent scrollable container to show the last comment
                if (contentScrollableRef.current) {
                    // Find the last comment element
                    const lastComment = commentsContainerRef.current?.lastElementChild;
                    if (lastComment) {
                        lastComment.scrollIntoView({ behavior: 'smooth', block: 'end' });
                    } else if (contentScrollableRef.current) {
                        // Fallback: scroll container to bottom
                        contentScrollableRef.current.scrollTop = contentScrollableRef.current.scrollHeight;
                    }
                }
            }, 150);
        }
    }, [activeTab, formData]); // Use formData directly - it's already initialized at this point
    
    // Fetch comment subscription status when on notes tab (legacy comments — kept for backward compat)
    useEffect(() => {
        if (activeTab !== 'notes' || !formData?.id || !window.DatabaseAPI?.makeRequest) return;
        const threadType = isLead ? 'lead' : 'client';
        window.DatabaseAPI.makeRequest(`/comment-subscriptions?threadType=${encodeURIComponent(threadType)}&threadId=${encodeURIComponent(formData.id)}`)
            .then((r) => { if (r && r.isSubscribed) setIsCommentSubscribed(true); })
            .catch(() => {});
    }, [activeTab, formData?.id, isLead]);

    // Get theme with safe fallback - don't check system preference, only localStorage
    let isDark = false;
    try {
        if (window.useTheme && typeof window.useTheme === 'function') {
            const themeResult = window.useTheme();
            isDark = themeResult?.isDark || false;
        } else {
            // Fallback: only check localStorage, NOT system preference
            const storedTheme = localStorage.getItem('abcotronics_theme');
            isDark = storedTheme === 'dark';
        }
    } catch (error) {
        // Fallback: only check localStorage, NOT system preference
        try {
            const storedTheme = localStorage.getItem('abcotronics_theme');
            isDark = storedTheme === 'dark';
        } catch (e) {
            isDark = false;
        }
    }
    
    // GPS coordinate parsing function
    const parseGPSCoordinates = (gpsString) => {
        if (!gpsString || !gpsString.trim()) return { latitude: '', longitude: '' };
        
        // Handle various GPS coordinate formats
        const formats = [
            // Format: "lat, lng" or "lat,lng"
            /^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/,
            // Format: "lat lng" (space separated)
            /^(-?\d+\.?\d*)\s+(-?\d+\.?\d*)$/,
            // Format: "lat° lng°" (with degree symbols)
            /^(-?\d+\.?\d*)°\s*(-?\d+\.?\d*)°$/
        ];
        
        for (const format of formats) {
            const match = gpsString.trim().match(format);
            if (match) {
                const lat = parseFloat(match[1]);
                const lng = parseFloat(match[2]);
                
                // Validate coordinate ranges
                if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                    return { latitude: lat.toString(), longitude: lng.toString() };
                }
            }
        }
        
        return { latitude: '', longitude: '' };
    };
    
    // Function to get current location
    const getCurrentLocation = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const lat = position.coords.latitude.toFixed(6);
                    const lng = position.coords.longitude.toFixed(6);
                    setNewSite(prev => ({
                        ...prev,
                        latitude: lat,
                        longitude: lng,
                        gpsCoordinates: `${lat}, ${lng}`
                    }));
                },
                (error) => {
                    console.error('Error getting location:', error);
                    alert('Unable to get current location. Please enter coordinates manually.');
                }
            );
        } else {
            alert('Geolocation is not supported by this browser.');
        }
    };

    const handleSiteMapLocationSelect = (coords) => {
        if (!coords || typeof coords.latitude !== 'number' || typeof coords.longitude !== 'number') {
            return;
        }

        const lat = coords.latitude.toFixed(6);
        const lng = coords.longitude.toFixed(6);

        setNewSite(prev => ({
            ...prev,
            latitude: lat,
            longitude: lng,
            gpsCoordinates: `${lat}, ${lng}`
        }));
    };
    
    // Load sites from database
    const loadSitesFromDatabase = useCallback(async (clientId) => {
        // FIXED: Don't load if client ID doesn't match current client (prevents race conditions)
        if (client?.id && String(client.id) !== String(clientId)) {
            console.log(`⏭️ Skipping loadSitesFromDatabase - client ID mismatch (current: ${client.id}, requested: ${clientId})`);
            return Promise.resolve([]);
        }
        
        const token = window.storage?.getToken?.();
        if (!token) {
            console.log('⏭️ Skipping loadSitesFromDatabase - no token');
            return Promise.resolve([]);
        }
        
        // Never overwrite sites while user just saved (Stage/AIDA) – avoids "changes briefly then disappear"
        if (isAutoSavingRef.current) {
            return Promise.resolve(formDataRef.current?.sites || []);
        }
        
        // Prevent duplicate requests with local ref check
                    if (isLoadingSitesRef.current) {
                        console.log('⏭️ Skipping loadSitesFromDatabase - already loading');
            return Promise.resolve([]);
                    }
                    
                    isLoadingSitesRef.current = true;
                    console.log(`📡 Loading sites from database for client: ${clientId}`);
                    
                    try {
                        const response = await window.api.getSites(clientId);
                        const sites = response?.data?.sites || [];
                        console.log(`✅ Loaded ${sites.length} sites from database for client: ${clientId}`);
                        
                        // Mark as loaded for this client to prevent infinite loop
                        sitesLoadedForClientIdRef.current = String(clientId);
                        
                        // CRITICAL FIX: Merge with existing sites; prefer DB sites by id so engagementStage/aidaStatus stay aligned with list/API
            console.log(`🔧 About to call setFormData with ${sites.length} sites`);
            try {
                const currentFormData = formDataRef.current || {};
                const existingSites = currentFormData.sites || [];
                const optimistic = optimisticSitesRef.current || [];
                const byId = new Map();
                [...sites, ...existingSites, ...optimistic].forEach(s => {
                    if (!s) return;
                    const id = s.id != null ? String(s.id) : null;
                    if (id && !byId.has(id)) byId.set(id, s);
                });
                const mergedSites = Array.from(byId.values());
                            const updated = {
                    ...currentFormData,
                                sites: mergedSites
                            };
                            console.log(`✅ Merged sites: ${mergedSites.length} total (${sites.length} from DB, ${existingSites.length} existing, ${(optimisticSitesRef.current || []).length} optimistic)`);
                
                // CRITICAL: Use functional update to ensure React detects the change
                console.log(`🔧🔧🔧 CALLING setFormData with functional update for sites (sites: ${mergedSites.length})`);
                setFormData(prevFormData => {
                    const currentFormData = prevFormData || {};
                    console.log(`🔧🔧🔧 INSIDE setFormData callback for sites - prevFormData.sites.length=${currentFormData.sites?.length || 0}`);
                    
                    // Create completely new object with new array references
                    const updated = {
                        ...currentFormData,
                        sites: [...mergedSites], // New array reference
                        _lastUpdated: Date.now() // Timestamp to force change detection
                    };
                    
                    // Update ref
                    formDataRef.current = updated;
                    console.log(`🔧🔧🔧 RETURNING updated formData from callback for sites (sites: ${updated.sites.length})`);
                    return updated;
                });
                console.log(`✅ setFormData called successfully for sites`);
            } catch (error) {
                console.error('❌ Error in setFormData for sites:', error);
                throw error;
            }

                        // Remove optimistic sites that now exist in database
                    setOptimisticSites(prev => {
                        const filtered = prev.filter(opt => !sites.some(db => db.id === opt.id));
                        if (filtered.length !== prev.length) {
                            console.log(`✅ Removed ${prev.length - filtered.length} optimistic sites (now confirmed in DB)`);
                        }
                        return filtered;
                    });
                        
            return sites; // Return sites array directly
        } catch (error) {
            console.error('❌ Error loading sites from database:', error);
            return []; // Return empty array on error
        } finally {
            isLoadingSitesRef.current = false;
        }
    }, [client?.id]);
    
    // Resolve lead sites persistence: when user opens Sites tab for a lead, always load from GET /api/sites/client/:id.
    // For clients, load when initialSiteId is set (deep link to specific site) so we have sites before opening it.
    useEffect(() => {
        if (activeTab !== 'sites' || !(formData?.id || client?.id) || !window.api?.getSites) return;
        const id = formData?.id || client?.id;
        const shouldLoad = isLead || (initialSiteId && (!formData?.sites || formData.sites.length === 0));
        if (shouldLoad) loadSitesFromDatabase(id);
    }, [activeTab, isLead, initialSiteId, formData?.id, formData?.sites, client?.id, loadSitesFromDatabase]);

    // REMOVED: Tab-specific job cards loading
    // Job cards are now loaded immediately when client opens (in the main client load useEffect)
    // This prevents reloading when clicking tabs and ensures counts appear immediately

    // Handle job card click - navigate to full job card detail page
    const handleJobCardClick = (jobCard) => {
        // Always use database ID for faster lookup (not jobCardNumber)
        const jobCardId = jobCard.id;
        if (jobCardId) {
            // Use the navigation event system to navigate to the full job card detail page
            window.dispatchEvent(new CustomEvent('navigateToPage', { 
                detail: { 
                    page: 'service-maintenance',
                    subpath: [jobCardId]
                } 
            }));
        }
    };

    const loadIncidentReports = useCallback(async () => {
        if (!client?.id) {
            setIncidentReports([]);
            return [];
        }
        const token = window.storage?.getToken?.();
        if (!token) {
            setLoadingIncidentReports(false);
            return [];
        }
        setLoadingIncidentReports(true);
        try {
            const response = await fetch(
                `/api/incident-reports?clientId=${encodeURIComponent(client.id)}&pageSize=200`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!response.ok) {
                setIncidentReports([]);
                return [];
            }
            const data = await response.json();
            const rows = data.incidentReports || data.data?.incidentReports || [];
            const list = Array.isArray(rows) ? rows : [];
            setIncidentReports(list);
            return list;
        } catch (error) {
            console.error('Error loading incident reports:', error);
            setIncidentReports([]);
            return [];
        } finally {
            setLoadingIncidentReports(false);
        }
    }, [client?.id]);

    const handleIncidentReportClick = (incident) => {
        const incidentId = incident?.id;
        if (!incidentId) return;
        window.dispatchEvent(new CustomEvent('navigateToPage', {
            detail: {
                page: 'service-maintenance',
                subpath: ['incidents', incidentId]
            }
        }));
    };
    
    const [editingContact, setEditingContact] = useState(null);
    const [showContactForm, setShowContactForm] = useState(false);
    const [newContact, setNewContact] = useState({
        name: '',
        role: '',
        department: '',
        email: '',
        phone: '',
        town: '',
        isPrimary: false,
        siteId: null,
        siteIds: []
    });
    
    const [newFollowUp, setNewFollowUp] = useState({
        date: '',
        time: '',
        type: 'Call',
        description: '',
        completed: false
    });
    const [editingFollowUp, setEditingFollowUp] = useState(null);
    const [calendarFeedUrl, setCalendarFeedUrl] = useState(null);
    const [calendarFeedLoading, setCalendarFeedLoading] = useState(false);
    const [calendarFeedVerify, setCalendarFeedVerify] = useState(null); // { count } | { error: string } | 'checking'
    
    const [newComment, setNewComment] = useState('');
    const [isCommentSubscribed, setIsCommentSubscribed] = useState(false);
    const [showSiteForm, setShowSiteForm] = useState(false);
    const [editingSite, setEditingSite] = useState(null);
    const [newSite, setNewSite] = useState({
        name: '',
        address: '',
        contactPerson: '',
        phone: '',
        email: '',
        notes: '',
        latitude: '',
        longitude: '',
        gpsCoordinates: '',
        siteLead: '',
        siteType: isLead ? 'lead' : 'client',
        engagementStage: 'Potential',
        aidaStatus: 'Awareness'
    });
    const [showOpportunityForm, setShowOpportunityForm] = useState(false);
    const [editingOpportunity, setEditingOpportunity] = useState(null);
    const [newOpportunity, setNewOpportunity] = useState({
        name: '',
        aidaStatus: 'Awareness',
        engagementStage: 'Potential',
        expectedCloseDate: '',
        relatedSiteId: null,
        notes: ''
    });

    // Fetch calendar feed URL when user opens Calendar tab (for subscribe-to-calendar)
    useEffect(() => {
        if (activeTab !== 'calendar' || calendarFeedUrl != null || calendarFeedLoading) return;
        const token = window.storage?.getToken?.();
        if (!token) return;
        setCalendarFeedLoading(true);
        const base = window.location.origin;
        fetch(`${base}/api/calendar/feed-token`, { headers: { Authorization: `Bearer ${token}` } })
            .then((res) => res.json())
            .then((json) => {
                const url = json?.data?.feedUrl || json?.feedUrl;
                if (url) setCalendarFeedUrl(url);
            })
            .catch(() => {})
            .finally(() => setCalendarFeedLoading(false));
    }, [activeTab, calendarFeedUrl, calendarFeedLoading]);

    useEffect(() => {
        // OLD COMPLEX LOGIC REMOVED - replaced with clean solution above
        // This useEffect is now empty and will be removed
        if (false && client?.id) {
            const currentClientId = String(client.id);
            const clientIdChanged = currentClientId !== lastSavedClientId.current;
            
            // CRITICAL FIX: Use module-level tracker to prevent duplicate loads even across remounts
            // Check if we're already loading this client (using module-level Map)
            const existingLoadPromise = clientInitialLoadTracker.get(currentClientId);
            const isAlreadyLoading = !!existingLoadPromise;
            
            console.log('🔍 ClientDetailModal state check (before reset):', {
                currentClientId,
                lastSavedClientId: lastSavedClientId.current,
                clientIdChanged,
                initialDataLoadedForClientId: initialDataLoadedForClientIdRef.current,
                hasPromise: !!initialLoadPromiseRef.current,
                moduleTrackerHasPromise: isAlreadyLoading
            });
            
            // CRITICAL FIX: Early guard check - if we're already loading this client, skip entirely
            // Check module-level tracker (persists across remounts) OR ref/promise (current mount)
            if (isAlreadyLoading || initialDataLoadedForClientIdRef.current === currentClientId || initialLoadPromiseRef.current) {
                console.log('⏭️ ClientDetailModal: Initial load already in progress or completed, skipping', {
                    refValue: initialDataLoadedForClientIdRef.current,
                    currentClientId,
                    hasPromise: !!initialLoadPromiseRef.current,
                    moduleTrackerHasPromise: isAlreadyLoading,
                    refMatches: initialDataLoadedForClientIdRef.current === currentClientId
                });
                return;
            }
            
            // Update lastSavedClientId if client changed
            if (clientIdChanged) {
                console.log('🔄 Client ID changed, resetting state');
                lastSavedClientId.current = currentClientId;
                lastProcessedClientRef.current = currentClientId;
                // Reset edit flag when switching clients
                hasUserEditedForm.current = false;
                // Clear optimistic updates when switching clients
                setOptimisticContacts([]);
                setOptimisticSites([]);
                // Reset sites loaded flag when client changes
                sitesLoadedForClientIdRef.current = null;
                // Reset initial data loaded flag when client changes - need to load again for new client
                initialDataLoadedForClientIdRef.current = null;
            }
            
            // CRITICAL FIX: Check if we've already loaded initial data for this client (AFTER reset)
            // Also check module-level tracker to catch loads that completed but ref wasn't set yet
            // This prevents duplicate loads while still allowing initial load when needed
            const hasLoadedInitialData = initialDataLoadedForClientIdRef.current === currentClientId || clientInitialLoadTracker.has(currentClientId);
            
            // Only load from database if:
            // 1. Client ID changed (switching to different client), OR
            // 2. Form hasn't been edited AND we haven't loaded initial data yet
            // This ensures data always loads on first open, but doesn't reload unnecessarily
            const shouldLoadFromDatabase = clientIdChanged || (!hasUserEditedForm.current && !hasLoadedInitialData);
            
            // Parse all JSON strings from API response
            // CRITICAL FIX: Prioritize normalized table data over JSON fields to prevent duplicates
            // If clientContacts relation exists, use ONLY that (parseClientJsonFields already converted it to contacts)
            // Ignore any JSON field contacts to prevent duplicates
            
            let finalContacts = [];
            
            // Check if we have normalized contacts (from parseClientJsonFields on API side)
            if (client.contacts && Array.isArray(client.contacts) && client.contacts.length > 0) {
                // API already ran parseClientJsonFields, so contacts are from normalized tables
                finalContacts = client.contacts;
            } else if (client.clientContacts && Array.isArray(client.clientContacts) && client.clientContacts.length > 0) {
                // Fallback: if relation object still exists, convert it
                finalContacts = client.clientContacts.map(contact => {
                    const siteIds = getContactSiteIds(contact);
                    return {
                        id: contact.id,
                        name: contact.name,
                        email: contact.email || '',
                        phone: contact.phone || '',
                        mobile: contact.mobile || '',
                        role: contact.role || '',
                        title: contact.title || '',
                        isPrimary: contact.isPrimary || false,
                        notes: contact.notes || '',
                        siteIds,
                        siteId: siteIds[0] || null
                    };
                });
            } else {
                // Last resort: parse from JSON fields (backward compatibility)
                const parsedContacts = typeof client.contacts === 'string' ? JSON.parse(client.contacts || '[]') : (client.contacts || []);
                finalContacts = Array.isArray(parsedContacts) ? parsedContacts : [];
            }
            
            // Ensure contacts are deduplicated by ID
            finalContacts = mergeUniqueById(finalContacts);
            
            // Same logic for sites
            let finalSites = [];
            if (client.sites && Array.isArray(client.sites) && client.sites.length > 0) {
                finalSites = client.sites;
            } else if (client.clientSites && Array.isArray(client.clientSites) && client.clientSites.length > 0) {
                finalSites = client.clientSites.map(site => ({
                    id: site.id,
                    name: site.name,
                    address: site.address || '',
                    contactPerson: site.contactPerson || '',
                    contactPhone: site.contactPhone || '',
                    contactEmail: site.contactEmail || '',
                    notes: site.notes || '',
                    siteLead: site.siteLead ?? '',
                    siteType: site.siteType === 'client' ? 'client' : 'lead',
                    engagementStage: (site.engagementStage != null && String(site.engagementStage).trim() !== '') ? String(site.engagementStage).trim() : 'Potential',
                    aidaStatus: (site.aidaStatus != null && String(site.aidaStatus).trim() !== '') ? String(site.aidaStatus).trim() : 'Awareness'
                }));
            } else {
                const parsedSites = typeof client.sites === 'string' ? JSON.parse(client.sites || '[]') : (client.sites || []);
                finalSites = Array.isArray(parsedSites) ? parsedSites : [];
            }
            finalSites = mergeUniqueById(finalSites);
            
            const parsedClient = {
                ...client,
                opportunities: typeof client.opportunities === 'string' ? JSON.parse(client.opportunities || '[]') : (client.opportunities || []),
                sites: finalSites,
                contacts: finalContacts, // Use deduplicated contacts
                followUps: typeof client.followUps === 'string' ? JSON.parse(client.followUps || '[]') : (client.followUps || []),
                comments: typeof client.comments === 'string' ? JSON.parse(client.comments || '[]') : (client.comments || []),
                contracts: typeof client.contracts === 'string' ? JSON.parse(client.contracts || '[]') : (client.contracts || []),
                activityLog: typeof client.activityLog === 'string' ? JSON.parse(client.activityLog || '[]') : (client.activityLog || []),
                projectIds: typeof client.projectIds === 'string' ? JSON.parse(client.projectIds || '[]') : (client.projectIds || []),
                services: typeof client.services === 'string' ? JSON.parse(client.services || '[]') : (client.services || [])
            };
            
            
            // Load data if:
            // 1. Client ID changed (switching to different client), OR
            // 2. We haven't done initial load for this client yet (first time opening)
            // This ensures data always loads immediately when opening a client
            const shouldDoInitialLoad = clientIdChanged || !hasLoadedInitialData;
            
            // Only set formData if we should load (new client or not edited)
            // CRITICAL FIX: Use functional update to preserve contacts/sites/opportunities that have been loaded from database
            // This prevents overwriting contacts that were loaded by loadContactsFromDatabase
            // Also, only set formData if we're doing initial load (not if already loaded)
            if (shouldLoadFromDatabase && shouldDoInitialLoad) {
                setFormData(prevFormData => {
                    // Preserve existing contacts, sites, and opportunities if they've been loaded from database
                    // Only use parsedClient values if we don't have existing data loaded
                    const existingContacts = prevFormData?.contacts || [];
                    const existingSites = prevFormData?.sites || [];
                    const existingOpportunities = prevFormData?.opportunities || [];
                    
                    // Use parsedClient data, but preserve loaded contacts/sites/opportunities if they exist
                    // This prevents resetting contacts that were loaded by loadContactsFromDatabase
                    return {
                        ...parsedClient,
                        contacts: existingContacts.length > 0 ? existingContacts : (parsedClient.contacts || []),
                        sites: existingSites.length > 0 ? existingSites : (parsedClient.sites || []),
                        opportunities: existingOpportunities.length > 0 ? existingOpportunities : (parsedClient.opportunities || [])
                    };
                });
            }
            
            // CRITICAL FIX: Don't reload contacts/sites if they're already in the client object
            // The API already returns normalized data via parseClientJsonFields
            // Loading again causes duplicates
            const hasContactsInClient = parsedClient.contacts && Array.isArray(parsedClient.contacts) && parsedClient.contacts.length > 0;
            const hasSitesInClient = parsedClient.sites && Array.isArray(parsedClient.sites) && parsedClient.sites.length > 0;
            
            // DEBUG: Log loading conditions
            console.log('🔍 ClientDetailModal loading check:', {
                currentClientId,
                clientIdChanged,
                hasUserEditedForm: hasUserEditedForm.current,
                hasLoadedInitialData,
                shouldLoadFromDatabase,
                shouldDoInitialLoad,
                willLoad: shouldLoadFromDatabase && shouldDoInitialLoad
            });
            
            // Load data from database if we should load AND form hasn't been edited
            if (shouldLoadFromDatabase && shouldDoInitialLoad) {
                console.log('✅ Starting initial data load for client:', currentClientId);
                console.log(`📊 Initial load state: criticalLoadPromises will be created, hasUserEditedForm=${hasUserEditedForm.current}`);
                // CRITICAL: Set ref and module-level tracker IMMEDIATELY to prevent duplicate loads
                // BUT: Don't set initialDataLoadedForClientIdRef yet - wait until after load completes
                // Setting it now would cause loadContactsFromDatabase to skip on initial load
                
                // Cancel any existing pending timeouts for this client
                pendingTimeoutsRef.current.forEach(timeoutId => {
                    clearTimeout(timeoutId);
                });
                pendingTimeoutsRef.current = [];
                
                // FIXED: Load ALL data immediately in parallel - no tab-specific loading
                // This ensures counts appear immediately and don't reload when clicking tabs
                const loadPromises = [];
                const criticalLoadPromises = []; // Loads that affect count badges (sites, contacts, opportunities, job cards)
                
                // Always load opportunities immediately (affects count badge)
                console.log(`🚀 About to call loadOpportunitiesFromDatabase for client: ${client.id}`);
                const opportunitiesPromise = loadOpportunitiesFromDatabase(client.id);
                console.log(`🚀 loadOpportunitiesFromDatabase returned promise:`, opportunitiesPromise);
                loadPromises.push(opportunitiesPromise);
                criticalLoadPromises.push(opportunitiesPromise);
                
                // Always load job cards immediately (affects service-maintenance tab count)
                // For initial load, we want to force a reload even if previously loaded
                // So we temporarily reset the ref, then load
                const originalLoadedClientId = lastLoadedClientIdRef.current;
                lastLoadedClientIdRef.current = null;
                const jobCardsPromise = (async () => {
                    try {
                        const result = await loadJobCards();
                        return result || [];
                    } catch (error) {
                        console.error('❌ Error loading job cards in initial load:', error);
                        return []; // Return empty array on error
                    } finally {
                        // Restore original value after loading attempt (or keep new value if successful)
                        // The loadJobCards function will set lastLoadedClientIdRef.current if successful
                        if (lastLoadedClientIdRef.current === null) {
                            lastLoadedClientIdRef.current = originalLoadedClientId;
                        }
                    }
                })();
                loadPromises.push(jobCardsPromise);
                criticalLoadPromises.push(jobCardsPromise);

                const incidentReportsPromise = loadIncidentReports().catch((error) => {
                    console.error('❌ Error loading incident reports in initial load:', error);
                    return [];
                });
                loadPromises.push(incidentReportsPromise);
                
                // ALWAYS load contacts immediately on initial load to ensure we have the latest data
                // Even if client object has contacts, we still load from DB to get the most up-to-date count
                // This prevents the count from changing when clicking the tab
                console.log(`🚀 About to call loadContactsFromDatabase for client: ${client.id}`);
                const contactPromise = loadContactsFromDatabase(client.id);
                console.log(`🚀 loadContactsFromDatabase returned promise:`, contactPromise);
                loadPromises.push(contactPromise);
                criticalLoadPromises.push(contactPromise);
                
                // ALWAYS load sites immediately on initial load to ensure we have the latest data
                // Even if client object has sites, we still load from DB to get the most up-to-date count
                // This prevents the count from changing when clicking the tab
                const sitesPromise = loadSitesFromDatabase(client.id);
                loadPromises.push(sitesPromise);
                criticalLoadPromises.push(sitesPromise);
                
                // CRITICAL FIX: Skip loadClientFromDatabase if contacts are already present OR being loaded
                // When contacts are present, it means the client object came from the API with all data parsed
                // When contacts are being loaded, we should wait for that to complete to avoid race conditions
                // Calling loadClientFromDatabase again causes a reload/re-render because:
                // 1. The API's parseClientJsonFields formats contacts differently (cross-populates phone/mobile)
                // 2. Even though we preserve existing contacts, the setFormData call triggers a re-render
                // 3. This causes the contact to "reload with another version" as reported
                // The initial client object from API already has contacts, comments, followUps, etc. parsed
                // So we don't need to reload unless contacts are missing AND not being loaded
                if (!hasContactsInClient && !isLoadingContactsRef.current) {
                    // Only load if contacts are missing AND not being loaded - this means we need to fetch everything
                    const clientPromise = loadClientFromDatabase(client.id);
                    loadPromises.push(clientPromise);
                    criticalLoadPromises.push(clientPromise);
                }
                
                // FIX FOR JITTERY LOADING: Track initial loading state to prevent progressive rendering
                // Load ALL data that affects counts immediately, then render everything at once
                if (criticalLoadPromises.length > 0) {
                    setIsInitialLoading(true);
                    // Execute all critical loads (sites, contacts, opportunities, job cards) in parallel
                    // Wait for ALL to complete before showing count badges
                    const loadPromise = Promise.all(criticalLoadPromises)
                        .then(() => {
                            // CRITICAL: Longer delay to ensure all React state updates from setFormData are processed
                            // React batches state updates, so we need to wait for them to complete before rendering
                            return new Promise(resolve => setTimeout(resolve, 200));
                        })
                        .catch(error => {
                            console.error('❌ Error loading critical client data:', error);
                            // On error, reset the ref so we can retry
                            initialDataLoadedForClientIdRef.current = null;
                        })
                        .finally(() => {
                            console.log('✅ Initial data load complete, setting isInitialLoading to false');
                            setIsInitialLoading(false);
                            initialLoadPromiseRef.current = null;
                            // DON'T clear module-level tracker after load completes - keep it until client changes
                            // This prevents duplicate loads if useEffect runs again after completion
                            // The tracker will be cleared when client ID changes (checked in guard)
                            // Ensure ref is set to prevent duplicate loads
                            if (initialDataLoadedForClientIdRef.current !== currentClientId) {
                                initialDataLoadedForClientIdRef.current = currentClientId;
                            }
                        });
                    initialLoadPromiseRef.current = loadPromise;
                    // CRITICAL: Track in module-level Map to prevent duplicates across remounts
                    clientInitialLoadTracker.set(currentClientId, loadPromise);
                } else {
                    // No critical data to load - client object already has everything
                    setIsInitialLoading(false);
                    // Still mark as loaded to prevent duplicate loads
                    initialDataLoadedForClientIdRef.current = currentClientId;
                }
            } else {
                // Not loading from database - client data is already complete
                setIsInitialLoading(false);
            }
            // Removed else block with empty body
        }
    }, [client?.id]); // Only depend on client.id, not entire client object to prevent infinite loops
    
    // When lead is updated from list (e.g. site Stage/AIDA changed), sync client.sites into formData so Sites section reflects changes
    const lastSyncedSitesFromClientRef = useRef(null);
    useEffect(() => {
        if (entityType !== 'lead' || !client?.id) return;
        const sites = client.sites || client.clientSites;
        if (!Array.isArray(sites) || sites.length === 0) return;
        const key = JSON.stringify(sites.map(s => ({ id: s?.id, engagementStage: s?.engagementStage ?? s?.stage, aidaStatus: s?.aidaStatus })));
        if (lastSyncedSitesFromClientRef.current === key) return;
        lastSyncedSitesFromClientRef.current = key;
        setFormData(prev => ({ ...prev, sites }));
    }, [entityType, client?.id, client?.sites, client?.clientSites]);
    
    // Load full client data from database to get latest comments, followUps, activityLog
    const loadClientFromDatabase = async (clientId) => {
        try {
            // Prevent duplicate requests
            if (isLoadingClientRef.current) {
                return;
            }
            
            // Skip if form has been edited to preserve optimistic updates
            if (hasUserEditedForm.current) {
                return;
            }
            
            // Don't reload if auto-saving is in progress
            if (isAutoSavingRef.current) {
                return;
            }
            
            const token = window.storage?.getToken?.();
            if (!token) {
                return;
            }
            
            isLoadingClientRef.current = true;
            
            try {
                const getOne = isLead
                    ? (window.DatabaseAPI?.getLead || window.api?.getLead)
                    : (window.DatabaseAPI?.getClient || window.api?.getClient);
                const response = typeof getOne === 'function'
                    ? await getOne(clientId, isLead ? undefined : { forceRefresh: true })
                    : null;
                const dbClient = isLead
                    ? (response?.data?.lead ?? response?.lead ?? response?.data)
                    : (response?.data?.client ?? response?.client ?? response?.data);
                
                // Check if response indicates an error
                if (response?.error || response?.status === 'error') {
                    const errorMessage = response?.error?.message || response?.error || 'Failed to load client data';
                    console.error('❌ API returned error:', errorMessage);
                    // Don't show alert for 500 errors - they're likely database issues
                    // Just log and continue with existing form data
                    return;
                }
                
                if (dbClient) {
                    
                    // CRITICAL: API already parsed contacts/sites via parseClientJsonFields
                    // They should already be arrays, not JSON strings
                    // Only parse if they're still strings (backward compatibility)
                    const parsedClient = {
                        ...dbClient,
                        // Skip parsing contacts - API already parsed them via parseClientJsonFields
                        // Parsing again would create different format (cross-populated phone/mobile)
                        contacts: Array.isArray(dbClient.contacts) ? dbClient.contacts : (typeof dbClient.contacts === 'string' ? JSON.parse(dbClient.contacts || '[]') : []),
                        followUps: typeof dbClient.followUps === 'string' ? JSON.parse(dbClient.followUps || '[]') : (Array.isArray(dbClient.followUps) ? dbClient.followUps : []),
                        projectIds: typeof dbClient.projectIds === 'string' ? JSON.parse(dbClient.projectIds || '[]') : (Array.isArray(dbClient.projectIds) ? dbClient.projectIds : []),
                        comments: typeof dbClient.comments === 'string' ? JSON.parse(dbClient.comments || '[]') : (Array.isArray(dbClient.comments) ? dbClient.comments : []),
                        // Skip parsing sites - API already parsed them via parseClientJsonFields
                        sites: Array.isArray(dbClient.sites) ? dbClient.sites : (typeof dbClient.sites === 'string' ? JSON.parse(dbClient.sites || '[]') : []),
                        contracts: typeof dbClient.contracts === 'string' ? JSON.parse(dbClient.contracts || '[]') : (Array.isArray(dbClient.contracts) ? dbClient.contracts : []),
                        proposals: typeof dbClient.proposals === 'string' ? JSON.parse(dbClient.proposals || '[]') : (Array.isArray(dbClient.proposals) ? dbClient.proposals : []),
                        activityLog: typeof dbClient.activityLog === 'string' ? JSON.parse(dbClient.activityLog || '[]') : (Array.isArray(dbClient.activityLog) ? dbClient.activityLog : []),
                        billingTerms: typeof dbClient.billingTerms === 'string' ? JSON.parse(dbClient.billingTerms || '{}') : (typeof dbClient.billingTerms === 'object' ? dbClient.billingTerms : {})
                    };
                    
                    
                    // Update formData with the fresh data from database
                    // CRITICAL: Only update comments, followUps, activityLog, contracts, proposals, services
                    // DO NOT update contacts or sites - those are managed separately via their own API endpoints
                    // Updating them here would cause duplicates since they're already loaded from normalized tables
                    setFormData(prevFormData => {
                        // CRITICAL FIX: Preserve existing contacts, sites, and opportunities, but only if they exist
                        // If contacts/sites/opportunities are empty but being loaded, preserve the empty array
                        // This prevents overwriting contacts/sites/opportunities that are being loaded separately
                        // However, if contacts/sites/opportunities are already loaded, preserve them
                        const existingContacts = prevFormData?.contacts || [];
                        const existingSites = prevFormData?.sites || [];
                        const existingOpportunities = prevFormData?.opportunities || [];
                        
                        // Merge new data with existing to ensure no loss
                        const mergedComments = mergeUniqueById(parsedClient.comments || [], prevFormData?.comments || []);
                        const mergedFollowUps = mergeUniqueById(parsedClient.followUps || [], prevFormData?.followUps || []);
                        const mergedContracts = mergeUniqueById(parsedClient.contracts || [], prevFormData?.contracts || []);
                        const mergedProposals = mergeLeadProposalsPreferringLocal(
                            parsedClient.proposals || [],
                            prevFormData?.proposals || []
                        );
                        
                        // CRITICAL FIX: Services are simple string arrays, not objects with IDs
                        // If user has edited services, preserve their current selection
                        // Otherwise, use the database value
                        let mergedServices;
                        if (userEditedFieldsRef.current.has('services')) {
                            // User has edited services - preserve their current selection
                            mergedServices = prevFormData?.services || [];
                        } else {
                            // Use database value, but merge with existing to avoid duplicates
                            const dbServices = Array.isArray(parsedClient.services) ? parsedClient.services : [];
                            const existingServices = Array.isArray(prevFormData?.services) ? prevFormData.services : [];
                            // For string arrays, just combine and remove duplicates
                            mergedServices = [...new Set([...dbServices, ...existingServices])];
                        }
                        
                        const updated = {
                            ...prevFormData,
                            comments: mergedComments,
                            followUps: mergedFollowUps,
                            activityLog: parsedClient.activityLog || prevFormData?.activityLog || [],
                            contracts: mergedContracts,
                            proposals: mergedProposals,
                            services: mergedServices,
                            // Explicitly preserve contacts, sites, and opportunities - NEVER update these here
                            contacts: existingContacts,
                            sites: existingSites,
                            opportunities: existingOpportunities
                        };
                        formDataRef.current = updated;
                        return updated;
                    });
                    
                }
            } catch (apiError) {
                // Handle API errors gracefully
                const errorMessage = apiError?.message || 'Unknown error';
                const isServerError = errorMessage.includes('500') || errorMessage.includes('Internal Server Error') || errorMessage.includes('Failed to get client');
                
                console.error('❌ Error loading client from database:', {
                    error: errorMessage,
                    clientId: clientId,
                    isServerError: isServerError
                });
                
                // For server errors (500), don't show alert - likely database issue
                // Continue with existing form data instead of breaking the UI
                if (!isServerError) {
                    // Only show alert for non-server errors (network, auth, etc.)
                    console.warn('⚠️ Client data load failed, continuing with existing data');
                }
            }
        } catch (error) {
            console.error('❌ Unexpected error in loadClientFromDatabase:', error);
        } finally {
            isLoadingClientRef.current = false;
        }
    };

    // Load contacts from database
    const loadContactsFromDatabase = async (clientId) => {
        console.log(`🔍 loadContactsFromDatabase CALLED for client: ${clientId}`);
        console.log(`🔍 Checking conditions: isLoadingContactsRef=${isLoadingContactsRef.current}, hasUserEditedForm=${hasUserEditedForm.current}`);
        try {
            // Prevent duplicate requests
            if (isLoadingContactsRef.current) {
                console.log(`⏭️ Skipping loadContactsFromDatabase - already loading`);
                return Promise.resolve([]);
            }
            
            // Skip loading if form has been edited to preserve optimistic updates
            // CRITICAL: Only skip if initial load has completed AND contacts are already loaded
            // This ensures contacts always load during initial load, even if form was edited
            const currentFormData = formDataRef.current || {};
            const existingContacts = currentFormData.contacts || [];
            if (hasUserEditedForm.current && initialDataLoadedForClientIdRef.current === clientId && existingContacts.length > 0) {
                console.log(`⏭️ Skipping loadContactsFromDatabase - form has been edited, initial load completed, and contacts already exist`);
                return Promise.resolve([]);
            }
            
            const token = window.storage?.getToken?.();
            if (!token) {
                console.log(`⏭️ Skipping loadContactsFromDatabase - no token`);
                return Promise.resolve([]);
            }
            
            isLoadingContactsRef.current = true;
            console.log(`📡 Loading contacts from database for client: ${clientId}`);
            const response = await window.api.getContacts(clientId);
            const contacts = response?.data?.contacts || [];
            console.log(`✅ Loaded ${contacts.length} contacts from database for client: ${clientId}`);
            
            // CRITICAL FIX: Merge with existing contacts to prevent duplicates
            // The client object may already have contacts from parseClientJsonFields
            console.log(`🔧 About to update formData with ${contacts.length} contacts`);
            console.log(`🔧 DEBUG: contacts array:`, contacts);
            console.log(`🔧 DEBUG: optimisticContacts array:`, optimisticContacts);
            
            // CRITICAL FIX: Get current formData from ref and update directly
            console.log(`🔧🔧🔧 BEFORE setFormData - contacts.length=${contacts.length}`);
            // Reuse currentFormData and existingContacts from earlier in the function
            const currentFormDataForUpdate = formDataRef.current || {};
            const existingContactsForUpdate = currentFormDataForUpdate.contacts || [];
            console.log(`🔧 Existing contacts count: ${existingContactsForUpdate.length}, Optimistic contacts count: ${optimisticContacts.length}`);
            
                // Merge: keep local site links; overlay API scalar fields
                const mergedContacts = mergeContactRecords(
                    [...existingContactsForUpdate, ...optimisticContacts],
                    contacts
                );
            console.log(`🔧 Merged contacts array:`, mergedContacts);
            
            // Create updated formData - ensure it's a completely new object reference
                const updated = {
                ...currentFormDataForUpdate,
                contacts: [...mergedContacts] // Create new array reference
                };
            
            console.log(`✅✅✅ Merged contacts: ${mergedContacts.length} total (${contacts.length} from DB, ${existingContactsForUpdate.length} existing, ${optimisticContacts.length} optimistic)`);
            console.log(`✅✅✅ Updated formData.contacts:`, mergedContacts);
            
            // CRITICAL: Use functional update to ensure React detects the change
            // This is the most reliable way to update state in React
            console.log(`🔧🔧🔧 CALLING setFormData with functional update (contacts: ${mergedContacts.length})`);
            setFormData(prevFormData => {
                const currentFormData = prevFormData || {};
                console.log(`🔧🔧🔧 INSIDE setFormData callback - prevFormData.contacts.length=${currentFormData.contacts?.length || 0}`);
                
                // Create completely new object with new array references
                const updated = {
                    ...currentFormData,
                    contacts: [...mergedContacts], // New array reference
                    _lastUpdated: Date.now() // Timestamp to force change detection
                };
                
                // Update ref
                formDataRef.current = updated;
                console.log(`🔧🔧🔧 RETURNING updated formData from callback (contacts: ${updated.contacts.length})`);
                return updated;
            });
            console.log(`✅ setFormData called with updated contacts - AFTER call`);

            // Remove optimistic contacts that now exist in database
            setOptimisticContacts(prev => prev.filter(opt => !contacts.some(db => db.id === opt.id)));
            
            return contacts; // Return contacts for Promise.all tracking
        } catch (error) {
            console.error('❌ Error loading contacts from database:', error);
            return []; // Return empty array on error
        } finally {
            isLoadingContactsRef.current = false;
        }
    };

    // Load groups for Services section
    const isLoadingGroupsRef = useRef(false);
    const loadGroups = useCallback(async () => {
        if (isLoadingGroupsRef.current) return;
        
        const token = window.storage?.getToken?.();
        if (!token) {
            isLoadingGroupsRef.current = false;
            setIsLoadingGroups(false);
            return;
        }
        if (window.RateLimitManager?.isRateLimited?.()) {
            setAvailableGroups([]);
            if (client?.id && lastClientGroupMembershipsKeyRef.current !== '') {
                lastClientGroupMembershipsKeyRef.current = '';
                setClientGroupMemberships([]);
            }
            return;
        }
        
        // Use global request deduplication to prevent duplicate API calls
        const groupsRequestKey = window.RequestDeduplicator?.getRequestKey('/api/clients/groups', {});
        const membershipsRequestKey = client?.id 
            ? window.RequestDeduplicator?.getRequestKey(`/api/clients/${client.id}/groups`, { clientId: client.id })
            : null;
        
        try {
            // Use deduplicator if available
            if (window.RequestDeduplicator) {
                // Load available groups with deduplication
                await window.RequestDeduplicator.deduplicate(groupsRequestKey, async () => {
                    isLoadingGroupsRef.current = true;
                    setIsLoadingGroups(true);
                    
                    try {
                        const groupsResponse = await fetch('/api/clients/groups', {
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            },
                            credentials: 'include'
                        });
                        
                        if (groupsResponse.ok) {
                            const groupsData = await groupsResponse.json();
                            const groups = groupsData?.data?.groups || groupsData?.groups || [];
                            setAvailableGroups(groups);
                        } else if (groupsResponse.status === 429) {
                            const retryAfter = parseInt(groupsResponse.headers.get('Retry-After') || '60', 10);
                            window.RateLimitManager?.setRateLimit?.(retryAfter);
                            setAvailableGroups([]);
                        }
                    } catch (error) {
                        if (error?.status !== 429 && error?.code !== 'RATE_LIMIT_EXCEEDED') {
                            console.error('Error loading groups:', error);
                        }
                    } finally {
                        isLoadingGroupsRef.current = false;
                        setIsLoadingGroups(false);
                    }
                }, 3000); // 3 second deduplication window for groups
                
                // Load client's current group memberships if client exists
                if (client?.id && membershipsRequestKey) {
                    await window.RequestDeduplicator.deduplicate(membershipsRequestKey, async () => {
                        try {
                            const membershipsResponse = await fetch(`/api/clients/${client.id}/groups`, {
                                headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json'
                                },
                                credentials: 'include'
                            });
                            
                            if (membershipsResponse.ok) {
                                const membershipsData = await membershipsResponse.json();
                                const memberships = membershipsData?.data?.groupMemberships || membershipsData?.groupMemberships || [];
                                const key = memberships.length ? memberships.map(m => m.group?.id ?? m.id).filter(Boolean).sort().join(',') : '';
                                if (lastClientGroupMembershipsKeyRef.current !== key) {
                                    lastClientGroupMembershipsKeyRef.current = key;
                                    setClientGroupMemberships(memberships);
                                }
                            } else if (membershipsResponse.status === 500) {
                                // Server error - likely database issue with this client
                                console.warn(`⚠️ Failed to load groups for client ${client.id} (500 error). Continuing without group data.`);
                                if (lastClientGroupMembershipsKeyRef.current !== '') {
                                    lastClientGroupMembershipsKeyRef.current = '';
                                    setClientGroupMemberships([]);
                                }
                            } else if (membershipsResponse.status === 404) {
                                // 404 is expected when client has no groups or doesn't exist - silently handle
                                if (lastClientGroupMembershipsKeyRef.current !== '') {
                                    lastClientGroupMembershipsKeyRef.current = '';
                                    setClientGroupMemberships([]);
                                }
                            } else if (membershipsResponse.status === 429) {
                                const retryAfter = parseInt(membershipsResponse.headers.get('Retry-After') || '60', 10);
                                window.RateLimitManager?.setRateLimit?.(retryAfter);
                                if (lastClientGroupMembershipsKeyRef.current !== '') {
                                    lastClientGroupMembershipsKeyRef.current = '';
                                    setClientGroupMemberships([]);
                                }
                            } else {
                                // Other errors (403, etc.)
                                console.warn(`⚠️ Failed to load groups for client ${client.id}: ${membershipsResponse.status}`);
                                if (lastClientGroupMembershipsKeyRef.current !== '') {
                                    lastClientGroupMembershipsKeyRef.current = '';
                                    setClientGroupMemberships([]);
                                }
                            }
                        } catch (groupError) {
                            const is429 = groupError?.status === 429 || groupError?.code === 'RATE_LIMIT_EXCEEDED';
                            const is404 = groupError?.message?.includes('404') || groupError?.status === 404 || groupError?.message?.includes('Not found');
                            if (!is429 && !is404) {
                                console.error('❌ Error loading client groups:', groupError);
                            }
                            if (lastClientGroupMembershipsKeyRef.current !== '') {
                                lastClientGroupMembershipsKeyRef.current = '';
                                setClientGroupMemberships([]);
                            }
                        }
                    }, 3000); // 3 second deduplication window for memberships
                }
            } else {
                // Fallback to original logic if RequestDeduplicator is not available
                isLoadingGroupsRef.current = true;
                setIsLoadingGroups(true);
                
                try {
                    const groupsResponse = await fetch('/api/clients/groups', {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        credentials: 'include'
                    });
                    
                    if (groupsResponse.ok) {
                        const groupsData = await groupsResponse.json();
                        const groups = groupsData?.data?.groups || groupsData?.groups || [];
                        setAvailableGroups(groups);
                    } else if (groupsResponse.status === 429) {
                        const retryAfter = parseInt(groupsResponse.headers.get('Retry-After') || '60', 10);
                        window.RateLimitManager?.setRateLimit?.(retryAfter);
                        setAvailableGroups([]);
                    }
                    
                    // Load client's current group memberships if client exists
                    if (client?.id) {
                        try {
                            const membershipsResponse = await fetch(`/api/clients/${client.id}/groups`, {
                                headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json'
                                },
                                credentials: 'include'
                            });
                            
                            if (membershipsResponse.ok) {
                                const membershipsData = await membershipsResponse.json();
                                const memberships = membershipsData?.data?.groupMemberships || membershipsData?.groupMemberships || [];
                                const key = memberships.length ? memberships.map(m => m.group?.id ?? m.id).filter(Boolean).sort().join(',') : '';
                                if (lastClientGroupMembershipsKeyRef.current !== key) {
                                    lastClientGroupMembershipsKeyRef.current = key;
                                    setClientGroupMemberships(memberships);
                                }
                            } else if (membershipsResponse.status === 500) {
                                console.warn(`⚠️ Failed to load groups for client ${client.id} (500 error). Continuing without group data.`);
                                if (lastClientGroupMembershipsKeyRef.current !== '') {
                                    lastClientGroupMembershipsKeyRef.current = '';
                                    setClientGroupMemberships([]);
                                }
                            } else if (membershipsResponse.status === 404) {
                                if (lastClientGroupMembershipsKeyRef.current !== '') {
                                    lastClientGroupMembershipsKeyRef.current = '';
                                    setClientGroupMemberships([]);
                                }
                            } else if (membershipsResponse.status === 429) {
                                const retryAfter = parseInt(membershipsResponse.headers.get('Retry-After') || '60', 10);
                                window.RateLimitManager?.setRateLimit?.(retryAfter);
                                if (lastClientGroupMembershipsKeyRef.current !== '') {
                                    lastClientGroupMembershipsKeyRef.current = '';
                                    setClientGroupMemberships([]);
                                }
                            } else {
                                console.warn(`⚠️ Failed to load groups for client ${client.id}: ${membershipsResponse.status}`);
                                if (lastClientGroupMembershipsKeyRef.current !== '') {
                                    lastClientGroupMembershipsKeyRef.current = '';
                                    setClientGroupMemberships([]);
                                }
                            }
                        } catch (groupError) {
                            if (groupError?.status !== 429 && groupError?.code !== 'RATE_LIMIT_EXCEEDED') {
                                console.error('❌ Error loading client groups:', groupError);
                            }
                            if (lastClientGroupMembershipsKeyRef.current !== '') {
                                lastClientGroupMembershipsKeyRef.current = '';
                                setClientGroupMemberships([]);
                            }
                        }
                    }
                } catch (error) {
                    if (error?.status !== 429 && error?.code !== 'RATE_LIMIT_EXCEEDED') {
                        console.error('Error loading groups:', error);
                    }
                } finally {
                    isLoadingGroupsRef.current = false;
                    setIsLoadingGroups(false);
                }
            }
        } catch (error) {
            if (error?.status !== 429 && error?.code !== 'RATE_LIMIT_EXCEEDED') {
                console.error('Error loading groups:', error);
            }
            isLoadingGroupsRef.current = false;
            setIsLoadingGroups(false);
        }
    }, [client?.id]);
    
    // Load groups when client changes
    useEffect(() => {
        if (client?.id) {
            lastClientGroupMembershipsKeyRef.current = null; // force next load to apply (different client)
            loadGroups();
        } else {
            if (lastClientGroupMembershipsKeyRef.current !== '') {
                lastClientGroupMembershipsKeyRef.current = '';
                setClientGroupMemberships([]);
            }
        }
    }, [client?.id, loadGroups]);
    
    // Handle adding client to group
    const handleAddToGroup = async () => {
        if (!client?.id || !selectedGroupId) {
            alert('Please select a group');
            return;
        }
        
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Please log in to assign groups');
                return;
            }
            
            const response = await fetch(`/api/clients/${client.id}/groups`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({ groupId: selectedGroupId, role: 'member' })
            });
            
            if (response.ok) {
                setShowGroupSelector(false);
                setSelectedGroupId('');
                await loadGroups(); // Reload groups
                
                console.log('📢 Dispatching clientGroupUpdated event for client:', client.id);
                
                // Trigger refresh of main clients/leads list
                window.dispatchEvent(new CustomEvent('clientGroupUpdated', { 
                    detail: { clientId: client.id, action: 'added' } 
                }));
                
                // Force LiveDataSync to refresh if available
                if (window.LiveDataSync?.forceSync) {
                    window.LiveDataSync.forceSync().catch(() => {});
                }
                
                alert('✅ Client added to group successfully');
            } else {
                const errorData = await response.json().catch(() => ({}));
                alert(errorData?.error?.message || errorData?.error || 'Failed to add client to group');
            }
        } catch (error) {
            console.error('Error adding client to group:', error);
            alert('Failed to add client to group. Please try again.');
        }
    };
    
    // Handle removing client from group
    const handleRemoveFromGroup = async (groupId) => {
        if (!client?.id || !groupId) return;
        
        if (!confirm('Remove this client from the group?')) return;
        
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Please log in to remove groups');
                return;
            }
            
            const response = await fetch(`/api/clients/${client.id}/groups/${groupId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });
            
            if (response.ok) {
                await loadGroups(); // Reload groups
                
                // Trigger refresh of main clients/leads list
                window.dispatchEvent(new CustomEvent('clientGroupUpdated', { 
                    detail: { clientId: client.id, action: 'removed' } 
                }));
                
                // Force LiveDataSync to refresh if available
                if (window.LiveDataSync?.forceSync) {
                    window.LiveDataSync.forceSync().catch(() => {});
                }
                
                alert('✅ Client removed from group successfully');
            } else {
                const errorData = await response.json().catch(() => ({}));
                alert(errorData?.error?.message || errorData?.error || 'Failed to remove client from group');
            }
        } catch (error) {
            console.error('Error removing client from group:', error);
            alert('Failed to remove client from group. Please try again.');
        }
    };

    // Load opportunities from database
    const loadOpportunitiesFromDatabase = async (clientId) => {
        console.log(`🔍 loadOpportunitiesFromDatabase CALLED for client: ${clientId}`);
        console.log(`🔍 Checking conditions: isLoadingOpportunitiesRef=${isLoadingOpportunitiesRef.current}`);
        try {
            // Prevent duplicate requests
            if (isLoadingOpportunitiesRef.current) {
                console.log(`⏭️ Skipping loadOpportunitiesFromDatabase - already loading`);
                return Promise.resolve([]);
            }
            
            const token = window.storage?.getToken?.();
            if (!token) {
                console.log(`⏭️ Skipping loadOpportunitiesFromDatabase - no token`);
                return Promise.resolve([]);
            }
            
            isLoadingOpportunitiesRef.current = true;
            console.log(`📡 Loading opportunities from database for client: ${clientId}`);
            const response = await window.api.getOpportunitiesByClient(clientId);
            const opportunities = response?.data?.opportunities || [];
            console.log(`✅ Loaded ${opportunities.length} opportunities from database for client: ${clientId}`);
            
            // Update formData with opportunities from database
            console.log(`🔧 About to update formData with ${opportunities.length} opportunities`);
            
            // CRITICAL FIX: Get current formData from ref and update directly
            const currentFormData = formDataRef.current || {};
            const updated = {
                ...currentFormData,
                opportunities: [...opportunities] // Create new array reference
            };
            // CRITICAL: Use functional update to ensure React detects the change
            console.log(`🔧🔧🔧 CALLING setFormData with functional update for opportunities (opportunities: ${opportunities.length})`);
            setFormData(prevFormData => {
                const currentFormData = prevFormData || {};
                console.log(`🔧🔧🔧 INSIDE setFormData callback for opportunities - prevFormData.opportunities.length=${currentFormData.opportunities?.length || 0}`);
                
                // Create completely new object with new array references
                const updated = {
                    ...currentFormData,
                    opportunities: [...opportunities], // New array reference
                    _lastUpdated: Date.now() // Timestamp to force change detection
                };
                
                // Update ref
                formDataRef.current = updated;
                console.log(`🔧🔧🔧 RETURNING updated formData from callback for opportunities (opportunities: ${updated.opportunities.length})`);
                return updated;
            });
            console.log(`✅ setFormData called with updated opportunities`);
            
            return opportunities; // Return opportunities for Promise.all tracking
        } catch (error) {
            console.error('❌ Error loading opportunities from database:', error);
            // Don't show error to user, just log it
            return []; // Return empty array on error
        } finally {
            isLoadingOpportunitiesRef.current = false;
        }
    };


    const handleAddContact = async () => {
        if (!newContact.name) {
            alert('Name is required');
            return;
        }
        
        // Prevent tab from reverting to overview while adding (same as notes/sites/calendar flow)
        isAutoSavingRef.current = true;
        lastInlineSaveAtRef.current = Date.now();
        handleTabChange('contacts');
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                isAutoSavingRef.current = false;
                alert('❌ Please log in to save contacts to the database');
                return;
            }
            
            if (!window.api?.createContact) {
                isAutoSavingRef.current = false;
                alert('❌ Contact API not available. Please refresh the page.');
                return;
            }
            
            const response = await window.api.createContact(formData.id, newContact);
            
            const savedContact = response?.data?.contact || response?.contact || response;
            
            if (savedContact && savedContact.id) {
                // Mark form as edited to prevent useEffect from resetting formData
                hasUserEditedForm.current = true;
                
                // Store clientId to avoid stale closure
                const clientId = formData.id;
                
                // Add to optimistic contacts state - this triggers re-render and persists even if formData gets reset
                setOptimisticContacts(prev => {
                    const contactExists = prev.some(c => c.id === savedContact.id);
                    if (contactExists) {
                        return prev;
                    }
                    const updated = [...prev, savedContact];
                    return updated;
                });
                
                // Optimistically update UI immediately - use functional update to get latest state
                let updatedFormDataAfterContact = null;
                setFormData(prev => {
                    const currentContacts = prev.contacts || [];
                    // Check if contact already exists to avoid duplicates
                    const contactExists = currentContacts.some(c => c.id === savedContact.id);
                    if (contactExists) {
                        return prev;
                    }
                    const updatedContacts = [...currentContacts, savedContact];
                    const newFormData = {
                        ...prev,
                        contacts: updatedContacts
                    };
                    updatedFormDataAfterContact = newFormData;
                    formDataRef.current = newFormData;
                    // Force React to see this as a new object reference
                    return newFormData;
                });
                
                // State update above will automatically trigger re-render
                
                const formDataForActivity = updatedFormDataAfterContact || formDataRef.current || formData;
                const mergedContactsForActivity = mergeUniqueById(formDataForActivity?.contacts, [savedContact, ...optimisticContacts]);
                const finalFormDataForActivity = {
                    ...formDataForActivity,
                    contacts: mergedContactsForActivity
                };
                formDataRef.current = finalFormDataForActivity;
                logActivity('Contact Added', `Added contact: ${newContact.name} (${newContact.email})`, null, true, finalFormDataForActivity);
                
                // Switch to contacts tab immediately
                handleTabChange('contacts');
                
                // Close form and reset
                setNewContact({
                    name: '',
                    role: '',
                    department: '',
                    email: '',
                    phone: '',
                    town: '',
                    isPrimary: false,
                    siteId: null,
                    siteIds: []
                });
                setShowContactForm(false);
                
                // Delay alert to ensure state update and render complete first
                setTimeout(() => {
                    alert('✅ Contact saved to database successfully!');
                }, 100);
                
                // Clear auto-save flag after tab and UI have settled so tab-sync effects don't revert to overview
                setTimeout(() => {
                    isAutoSavingRef.current = false;
                }, TAB_PRESERVE_AFTER_INLINE_SAVE_MS);
                
            } else {
                throw new Error('No contact ID returned from API');
            }
        } catch (error) {
            isAutoSavingRef.current = false;
            console.error('❌ Error creating contact:', error);
            alert('❌ Error saving contact to database: ' + error.message);
        }
    };

    const handleEditContact = (contact) => {
        setEditingContact(contact);
        const siteIds = getContactSiteIds(contact);
        setNewContact({ ...contact, siteIds, siteId: siteIds[0] || null });
        setShowContactForm(true);
    };

    const handleUpdateContact = () => {
        const siteIds = getContactSiteIds(newContact);
        const contactPayload = { ...newContact, siteIds, siteId: siteIds[0] || null };
        const updatedContacts = formData.contacts.map(c =>
            String(c.id) === String(editingContact.id) ? { ...contactPayload, id: c.id } : c
        );
        const updatedFormData = {...formData, contacts: updatedContacts};
        setFormData(updatedFormData);
        formDataRef.current = updatedFormData;
        
        // Log activity and get updated formData with activity log, then save everything
        const finalFormData = logActivity('Contact Updated', `Updated contact: ${newContact.name}`, null, false, updatedFormData);
        
        // Prevent tab from reverting to overview while saving (same as add contact flow)
        isAutoSavingRef.current = true;
        lastInlineSaveAtRef.current = Date.now();
        Promise.resolve().then(() => onSave(finalFormData, true)).finally(() => {
            setTimeout(() => {
                isAutoSavingRef.current = false;
            }, TAB_PRESERVE_AFTER_INLINE_SAVE_MS);
        });
        
        setEditingContact(null);
        setNewContact({
            name: '',
            role: '',
            department: '',
            email: '',
            phone: '',
            town: '',
            isPrimary: false,
            siteId: null,
            siteIds: []
        });
        setShowContactForm(false);
        // Stay in contacts tab (use setTimeout to ensure it happens after re-render)
        setTimeout(() => {
            handleTabChange('contacts');
        }, 100);
        
    };

    const handleDeleteContact = (contactId) => {
        if (confirm('Remove this contact?')) {
            const contact = formData.contacts.find(c => c.id === contactId);
            const updatedFormData = {
                ...formData,
                contacts: formData.contacts.filter(c => c.id !== contactId)
            };
            setFormData(updatedFormData);
            formDataRef.current = updatedFormData;
            
            // Log activity and get updated formData with activity log, then save everything
            const finalFormData = logActivity('Contact Deleted', `Deleted contact: ${contact?.name || 'Unknown'}`, null, false, updatedFormData);
            
            // Prevent tab from reverting to overview while saving (same as add contact flow)
            isAutoSavingRef.current = true;
            lastInlineSaveAtRef.current = Date.now();
            Promise.resolve().then(() => onSave(finalFormData, true)).finally(() => {
                setTimeout(() => {
                    isAutoSavingRef.current = false;
                }, TAB_PRESERVE_AFTER_INLINE_SAVE_MS);
            });
            // Stay in contacts tab (use setTimeout to ensure it happens after re-render)
            setTimeout(() => {
                handleTabChange('contacts');
            }, 100);
            
        }
    };

    // Link/unlink contact to current site (Sites tab – Linked contacts); persists via contacts API
    const persistContactSiteLinks = async (contactId, nextSiteIds, activityTitle, activityDetail) => {
        const clientId = formData.id || client?.id;
        if (!clientId || !contactId || !editingSite?.id) return;

        const cid = String(contactId);
        const siteId = String(editingSite.id);
        const allContacts = mergeContactRecords(formData.contacts || [], optimisticContacts || []);
        const target = allContacts.find((c) => String(c.id) === cid);
        if (!target) {
            alert('Contact not found. Refresh the page and try again.');
            return;
        }

        const updatedContact = { ...target, siteIds: nextSiteIds, siteId: nextSiteIds[0] || null };
        const updatedContacts = allContacts.map((c) => (String(c.id) === cid ? updatedContact : c));
        const updatedFormData = { ...formData, contacts: updatedContacts };
        setFormData(updatedFormData);
        formDataRef.current = updatedFormData;
        isAutoSavingRef.current = true;
        lastInlineSaveAtRef.current = Date.now();
        hasUserEditedForm.current = true;

        try {
            if (window.api?.updateContact) {
                await window.api.updateContact(clientId, cid, { siteIds: nextSiteIds });
            } else {
                const finalFormData = logActivity(activityTitle, activityDetail, null, false, updatedFormData);
                await onSave(finalFormData, true);
                return;
            }
            logActivity(activityTitle, activityDetail, null, false, updatedFormData);
        } catch (err) {
            console.error('Failed to update contact site links:', err);
            alert('Could not save contact link: ' + (err?.message || 'Unknown error'));
            setFormData(formData);
            formDataRef.current = formData;
        } finally {
            setTimeout(() => { isAutoSavingRef.current = false; }, TAB_PRESERVE_AFTER_INLINE_SAVE_MS);
        }
    };

    const handleLinkContactToSite = (contactId) => {
        if (!editingSite?.id || !contactId) return;
        const allContacts = mergeContactRecords(formData.contacts || [], optimisticContacts || []);
        const target = allContacts.find((c) => String(c.id) === String(contactId));
        if (!target) return;
        const nextSiteIds = [...new Set([...getContactSiteIds(target), String(editingSite.id)])];
        void persistContactSiteLinks(contactId, nextSiteIds, 'Contact linked to site', `Linked contact to site ${editingSite.name || 'this site'}`);
    };

    const handleUnlinkContactFromSite = (contactId) => {
        if (!editingSite?.id || !contactId) return;
        const allContacts = mergeContactRecords(formData.contacts || [], optimisticContacts || []);
        const target = allContacts.find((c) => String(c.id) === String(contactId));
        if (!target) return;
        const nextSiteIds = getContactSiteIds(target).filter((id) => id !== String(editingSite.id));
        void persistContactSiteLinks(contactId, nextSiteIds, 'Contact unlinked from site', 'Contact unlinked from this site');
    };

    const handleAddFollowUp = () => {
        if (!newFollowUp.date || !newFollowUp.description) {
            alert('Date and description are required');
            return;
        }
        
        const newFollowUpItem = {
            ...newFollowUp,
            id: Date.now(),
            createdAt: new Date().toISOString()
        };
        
        const currentFollowUps = Array.isArray(formData.followUps) ? formData.followUps : [];
        const updatedFollowUps = [...currentFollowUps, newFollowUpItem];
        
        // Get current user info
        const updatedFormData = {
            ...formData,
            followUps: updatedFollowUps
        };
        setFormData(updatedFormData);
        
        // Log activity and get updated formData with activity log, then save everything
        const finalFormData = logActivity('Follow-up Added', `Scheduled ${newFollowUp.type} for ${newFollowUp.date}`, null, false, updatedFormData);
        
        // Save follow-up changes and activity log immediately - stay in edit mode
        // CRITICAL: Explicitly ensure followUps are in the data being saved
        const dataToSave = {
            ...finalFormData,
            followUps: updatedFollowUps // Explicitly include followUps
        };
        
        console.log('💾 Saving follow-up:', {
            leadId: dataToSave.id,
            followUpsCount: dataToSave.followUps?.length || 0,
            latestFollowUp: dataToSave.followUps?.[dataToSave.followUps.length - 1]
        });
        
        isAutoSavingRef.current = true;
        lastInlineSaveAtRef.current = Date.now();
        Promise.resolve().then(() => onSave(dataToSave, true)).then(() => {
            setTimeout(() => { handleTabChange('calendar'); }, 0);
        }).finally(() => {
            setTimeout(() => { isAutoSavingRef.current = false; }, TAB_PRESERVE_AFTER_INLINE_SAVE_MS);
        });
        
        setNewFollowUp({
            date: '',
            time: '',
            type: 'Call',
            description: '',
            completed: false
        });
    };

    const handleToggleFollowUp = (followUpId) => {
        const followUp = formData.followUps.find(f => f.id === followUpId);
        const updatedFollowUps = formData.followUps.map(f => 
            f.id === followUpId ? {...f, completed: !f.completed} : f
        );
        
        const updatedFormData = {...formData, followUps: updatedFollowUps};
        setFormData(updatedFormData);
        
        // Log activity when follow-up is completed
        if (followUp && !followUp.completed) {
            // Log activity and get updated formData with activity log, then save everything
            const finalFormData = logActivity('Follow-up Completed', `Completed: ${followUp.description}`, null, false, updatedFormData);
            
            // Save follow-up toggle and activity log immediately - stay in edit mode
            // CRITICAL: Explicitly ensure followUps are in the data being saved
            const dataToSave = {
                ...finalFormData,
                followUps: updatedFollowUps // Explicitly include followUps
            };
            
            isAutoSavingRef.current = true;
            lastInlineSaveAtRef.current = Date.now();
            Promise.resolve().then(() => onSave(dataToSave, true)).then(() => {
                setTimeout(() => { handleTabChange('calendar'); }, 0);
            }).finally(() => {
                setTimeout(() => { isAutoSavingRef.current = false; }, TAB_PRESERVE_AFTER_INLINE_SAVE_MS);
            });
        } else {
            // Just save the follow-up toggle (no activity log needed for uncompleting)
            // CRITICAL: Explicitly ensure followUps are in the data being saved
            const dataToSave = {
                ...updatedFormData,
                followUps: updatedFollowUps // Explicitly include followUps
            };
            
            isAutoSavingRef.current = true;
            Promise.resolve().then(() => onSave(dataToSave, true)).then(() => {
                setTimeout(() => { handleTabChange('calendar'); }, 0);
            }).finally(() => {
                setTimeout(() => { isAutoSavingRef.current = false; }, TAB_PRESERVE_AFTER_INLINE_SAVE_MS);
            });
        }
    };

    const handleDeleteFollowUp = (followUpId) => {
        if (confirm('Delete this follow-up?')) {
            const followUp = formData.followUps.find(f => f.id === followUpId);
            const updatedFormData = {
                ...formData,
                followUps: formData.followUps.filter(f => f.id !== followUpId)
            };
            setFormData(updatedFormData);
            if (editingFollowUp && editingFollowUp.id === followUpId) {
                setEditingFollowUp(null);
            }
            
            // Log activity and get updated formData with activity log, then save everything
            const finalFormData = logActivity('Follow-up Deleted', `Deleted follow-up: ${followUp?.description || followUp?.type || 'Unknown'}`, null, false, updatedFormData);
            
            // Save follow-up deletion and activity log immediately - stay in edit mode
            // CRITICAL: Explicitly ensure followUps are in the data being saved
            const dataToSave = {
                ...finalFormData,
                followUps: updatedFormData.followUps // Explicitly include followUps
            };
            
            isAutoSavingRef.current = true;
            lastInlineSaveAtRef.current = Date.now();
            Promise.resolve().then(() => onSave(dataToSave, true)).then(() => {
                setTimeout(() => { handleTabChange('calendar'); }, 0);
            }).finally(() => {
                setTimeout(() => { isAutoSavingRef.current = false; }, TAB_PRESERVE_AFTER_INLINE_SAVE_MS);
            });
        }
    };

    const handleEditFollowUp = (followUp) => {
        setEditingFollowUp({
            id: followUp.id,
            date: followUp.date || '',
            time: followUp.time || '',
            type: followUp.type || 'Call',
            description: followUp.description || '',
            completed: followUp.completed
        });
    };

    const handleSaveFollowUpEdit = () => {
        if (!editingFollowUp) return;
        if (!editingFollowUp.date || !editingFollowUp.description) {
            alert('Date and description are required');
            return;
        }
        const updatedFollowUps = formData.followUps.map(f =>
            f.id === editingFollowUp.id
                ? { ...f, date: editingFollowUp.date, time: editingFollowUp.time, type: editingFollowUp.type, description: editingFollowUp.description }
                : f
        );
        const updatedFormData = { ...formData, followUps: updatedFollowUps };
        setFormData(updatedFormData);
        setEditingFollowUp(null);
        const finalFormData = logActivity('Follow-up Updated', `Updated ${editingFollowUp.type} for ${editingFollowUp.date}`, null, false, updatedFormData);
        const dataToSave = { ...finalFormData, followUps: updatedFormData.followUps };
        isAutoSavingRef.current = true;
        lastInlineSaveAtRef.current = Date.now();
        Promise.resolve().then(() => onSave(dataToSave, true)).then(() => {
            setTimeout(() => { handleTabChange('calendar'); }, 0);
        }).finally(() => {
            setTimeout(() => { isAutoSavingRef.current = false; }, TAB_PRESERVE_AFTER_INLINE_SAVE_MS);
        });
    };

    const handleCancelFollowUpEdit = () => {
        setEditingFollowUp(null);
    };


    // Notes helpers: tags, attachments, simple markdown toggle
    const [newNoteTagsInput, setNewNoteTagsInput] = useState('');
    const [newNoteTags, setNewNoteTags] = useState([]);
    const [newNoteAttachments, setNewNoteAttachments] = useState([]);
    const [notesTagFilter, setNotesTagFilter] = useState(null);

    // Client notes (ClientNote table — same UX as Project Notes)
    const [clientNotesList, setClientNotesList] = useState(null);
    const [editingClientNoteFull, setEditingClientNoteFull] = useState(null);
    const [expandedClientNoteActivityId, setExpandedClientNoteActivityId] = useState(null);
    const [clientNoteActivityByNoteId, setClientNoteActivityByNoteId] = useState({});
    const [editorClientNoteActivityPanelOpen, setEditorClientNoteActivityPanelOpen] = useState(false);
    const [clientNoteActivityForEditor, setClientNoteActivityForEditor] = useState([]);
    const [isSavingClientNote, setIsSavingClientNote] = useState(false);

    const handleAddTagFromInput = () => {
        const raw = (newNoteTagsInput || '').trim();
        if (!raw) return;
        const parts = raw.split(',').map(t => t.trim()).filter(Boolean);
        const next = Array.from(new Set([...(newNoteTags || []), ...parts]));
        setNewNoteTags(next);
        setNewNoteTagsInput('');
    };

    const handleRemoveNewTag = (tag) => {
        setNewNoteTags((newNoteTags || []).filter(t => t !== tag));
    };

    const handleAttachmentFiles = async (files) => {
        if (!files || files.length === 0) return;
        const fileArray = Array.from(files);
        const reads = await Promise.all(fileArray.map(file => new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve({
                id: `${Date.now()}-${file.name}`,
                name: file.name,
                size: file.size,
                type: file.type,
                dataUrl: reader.result
            });
            reader.readAsDataURL(file);
        })));
        setNewNoteAttachments([...(newNoteAttachments || []), ...reads]);
    };

    const handleRemoveNewAttachment = (id) => {
        setNewNoteAttachments((newNoteAttachments || []).filter(a => a.id !== id));
    };

    // Client notes API (ClientNote table)
    const loadClientNotes = useCallback(async () => {
        const clientId = formData?.id;
        if (!clientId || !window.storage?.getToken?.()) return;
        setClientNotesList(null);
        try {
            const token = window.storage.getToken();
            const res = await fetch(`/api/clients/${encodeURIComponent(clientId)}/notes`, { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json().catch(() => ({}));
            const list = data?.data?.notes ?? data?.notes ?? [];
            setClientNotesList(Array.isArray(list) ? list : []);
        } catch (e) {
            console.error('Load client notes failed:', e);
            setClientNotesList([]);
        }
    }, [formData?.id]);

    const loadActivityForClientNote = useCallback(async (noteId) => {
        const clientId = formData?.id;
        if (!clientId || !noteId || !window.storage?.getToken?.()) return [];
        try {
            const token = window.storage.getToken();
            const url = `/api/client-activity-logs?clientId=${encodeURIComponent(clientId)}&noteId=${encodeURIComponent(noteId)}&limit=50`;
            const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json().catch(() => ({}));
            const logs = data?.data?.logs ?? data?.logs ?? [];
            return Array.isArray(logs) ? logs : [];
        } catch (e) {
            console.warn('Load client note activity failed:', e);
            return [];
        }
    }, [formData?.id]);

    const createClientNote = useCallback(async () => {
        const clientId = formData?.id;
        if (!clientId || !window.storage?.getToken?.()) return;
        setIsSavingClientNote(true);
        try {
            const token = window.storage.getToken();
            const res = await fetch(`/api/clients/${encodeURIComponent(clientId)}/notes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ title: 'Untitled Note', content: '', tags: [] })
            });
            const data = await res.json().catch(() => ({}));
            const note = data?.data?.note ?? data?.note;
            if (note) {
                setClientNotesList(prev => (prev ? [note, ...prev] : [note]));
                setEditingClientNoteFull(note);
                setEditorClientNoteActivityPanelOpen(false);
                setClientNoteActivityForEditor([]);
            }
        } catch (e) {
            console.error('Create client note failed:', e);
        } finally {
            setIsSavingClientNote(false);
        }
    }, [formData?.id]);

    const handleSaveClientNote = useCallback(async (payload) => {
        const clientId = formData?.id;
        const noteId = payload?.id;
        if (!clientId || !noteId || !window.storage?.getToken?.()) return;
        setIsSavingClientNote(true);
        try {
            const token = window.storage.getToken();
            const res = await fetch(`/api/clients/${encodeURIComponent(clientId)}/notes/${encodeURIComponent(noteId)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    title: payload.title || 'Untitled Note',
                    content: payload.content || '',
                    tags: Array.isArray(payload.tags) ? payload.tags : []
                })
            });
            const data = await res.json().catch(() => ({}));
            const updated = data?.data?.note ?? data?.note;
            if (updated) {
                setClientNotesList(prev => prev ? prev.map(n => n.id === noteId ? updated : n) : []);
                setEditingClientNoteFull(updated);
                loadActivityForClientNote(noteId).then(setClientNoteActivityForEditor);
            }
        } catch (e) {
            console.error('Save client note failed:', e);
        } finally {
            setIsSavingClientNote(false);
        }
    }, [formData?.id, loadActivityForClientNote]);

    const handleDeleteClientNote = useCallback(async (payload) => {
        const clientId = formData?.id;
        const noteId = typeof payload === 'string' ? payload : payload?.id;
        if (!clientId || !noteId || !window.storage?.getToken?.()) return;
        if (!confirm('Delete this note?')) return;
        setIsSavingClientNote(true);
        try {
            const token = window.storage.getToken();
            const res = await fetch(`/api/clients/${encodeURIComponent(clientId)}/notes/${encodeURIComponent(noteId)}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error?.message || data?.error || `Failed to delete note (${res.status})`);
            }
            setClientNotesList(prev => prev ? prev.filter(n => n.id !== noteId) : []);
            setEditingClientNoteFull(null);
            setClientNoteActivityForEditor([]);
            setExpandedClientNoteActivityId(null);
        } catch (e) {
            console.error('Delete client note failed:', e);
            alert('Failed to delete note. Please refresh and try again.');
        } finally {
            setIsSavingClientNote(false);
        }
    }, [formData?.id]);

    const handleToggleClientNoteActivity = useCallback((e, note) => {
        e?.stopPropagation?.();
        const id = note?.id;
        if (!id) return;
        if (expandedClientNoteActivityId === id) {
            setExpandedClientNoteActivityId(null);
            return;
        }
        setExpandedClientNoteActivityId(id);
        if (!clientNoteActivityByNoteId[id]) {
            loadActivityForClientNote(id).then(logs => {
                setClientNoteActivityByNoteId(prev => ({ ...prev, [id]: logs }));
            });
        }
    }, [expandedClientNoteActivityId, clientNoteActivityByNoteId, loadActivityForClientNote]);

    // Load client notes (ClientNote table) when Notes tab is active — must be after loadClientNotes is defined
    useEffect(() => {
        if (activeTab !== 'notes' || !formData?.id) return;
        loadClientNotes();
    }, [activeTab, formData?.id, loadClientNotes]);

    // Load activity for the note currently being edited (right-hand panel)
    useEffect(() => {
        const noteId = editingClientNoteFull?.id;
        if (!noteId || !loadActivityForClientNote) return;
        let cancelled = false;
        loadActivityForClientNote(noteId).then(logs => {
            if (!cancelled) setClientNoteActivityForEditor(Array.isArray(logs) ? logs : []);
        });
        return () => { cancelled = true; };
    }, [editingClientNoteFull?.id, loadActivityForClientNote]);

    const handleAddComment = async () => {
        if (!newComment.trim()) return;
        
        // Get current user info
        const user = window.storage?.getUser?.() || {};
        const currentUser = {
            name: user?.name || 'System',
            email: user?.email || 'system',
            id: user?.id || 'system'
        };
        
        let allUsers = [];
        try {
            if (window.DatabaseAPI?.getUsers) {
                const usersResponse = await window.DatabaseAPI.getUsers();
                allUsers = usersResponse?.data?.users || usersResponse?.data?.data?.users || [];
            }
        } catch (_) {}
        
        // Process @mentions if MentionHelper is available
        if (window.MentionHelper && window.MentionHelper.hasMentions(newComment) && allUsers.length) {
            try {
                const contextTitle = `${entityLabel}: ${formData.name || 'Unknown'}`;
                const contextLink = (isLead ? `#/leads/${formData.id}` : `#/clients/${formData.id}`) + '?tab=notes';
                await window.MentionHelper.processMentions(
                    newComment,
                    contextTitle,
                    contextLink,
                    currentUser.name || currentUser.email || 'Unknown',
                    allUsers,
                    isLead ? { leadId: formData.id } : { clientId: formData.id }
                );
            } catch (error) {
                console.error('❌ Error processing @mentions:', error);
            }
        }
        
        // Subscribe everyone involved (author, mentioned, prior comment authors) and notify subscribers
        const threadType = isLead ? 'lead' : 'client';
        const threadId = formData.id;
        if (threadId && window.DatabaseAPI?.makeRequest) {
            try {
                const mentionedEntries = (window.MentionHelper && window.MentionHelper.getMentionedUsernames(newComment)) || [];
                const mentionedIds = mentionedEntries
                    .map(({ normalized }) => {
                        const u = allUsers.find(a => 
                            (window.MentionHelper.normalizeIdentifier(a.name || '') === normalized) ||
                            (window.MentionHelper.normalizeIdentifier((a.email || '').split('@')[0]) === normalized)
                        );
                        return u?.id;
                    })
                    .filter(Boolean);
                const priorIds = (formData.comments || []).map(c => c.createdById || c.userId).filter(Boolean);
                const subscriberIds = [...new Set([currentUser.id, ...mentionedIds, ...priorIds])].filter(Boolean);
                await window.DatabaseAPI.makeRequest('/comment-subscriptions', {
                    method: 'POST',
                    body: JSON.stringify({ threadType, threadId, userIds: subscriberIds })
                });
                setIsCommentSubscribed(true);
                const contextTitle = `${entityLabel}: ${formData.name || 'Unknown'}`;
                const contextLink = (isLead ? `#/leads/${formData.id}` : `#/clients/${formData.id}`) + '?tab=notes';
                const toNotify = subscriberIds.filter(id => id !== currentUser.id && !mentionedIds.includes(id));
                for (const uid of toNotify) {
                    try {
                        await window.DatabaseAPI.makeRequest('/notifications', {
                            method: 'POST',
                            body: JSON.stringify({
                                userId: uid,
                                type: 'comment',
                                title: `New comment on ${entityLabelLower}: ${formData.name || 'Unknown'}`,
                                message: `${currentUser.name} commented: "${newComment.substring(0, 80)}${newComment.length > 80 ? '...' : ''}"`,
                                link: contextLink,
                                metadata: {
                                    clientId: isLead ? null : formData.id,
                                    leadId: isLead ? formData.id : null,
                                    commentAuthor: currentUser.name,
                                    commentText: newComment,
                                    tab: 'notes'
                                }
                            })
                        });
                    } catch (_) {}
                }
            } catch (err) {
                console.warn('Comment subscription/notify failed:', err?.message);
            }
        }
        
        const newCommentObj = {
            id: Date.now(),
            text: newComment,
            tags: Array.isArray(newNoteTags) ? newNoteTags : [],
            attachments: Array.isArray(newNoteAttachments) ? newNoteAttachments : [],
            createdAt: new Date().toISOString(),
            createdBy: currentUser.name,
            createdByEmail: currentUser.email,
            createdById: currentUser.id
        };
        
        const updatedComments = [...(formData.comments || []), newCommentObj];
        
        // CRITICAL: Build the complete formData with comments and activity log
        // Do this BEFORE updating state to ensure we have the correct data for saving
        const activity = {
            id: Date.now() + 1, // Ensure unique ID
            type: 'Comment Added',
            description: `Added note: ${newComment.substring(0, 50)}${newComment.length > 50 ? '...' : ''}`,
            timestamp: new Date().toISOString(),
            user: currentUser.name,
            userId: currentUser.id,
            userEmail: currentUser.email,
            relatedId: null
        };
        
        const updatedFormData = {
            ...formData,
            comments: updatedComments,
            activityLog: [...(formData.activityLog || []), activity]
        };
        
        // CRITICAL: Update formDataRef immediately so guards and other code see the updated comments
        formDataRef.current = updatedFormData;
        // CRITICAL: Update state immediately so comment appears in UI
        setFormData(updatedFormData);
        
        // Log to audit trail
        if (window.AuditLogger) {
            window.AuditLogger.log(
                'comment',
                'clients',
                {
                    action: 'Comment Added',
                    clientId: formData.id,
                    clientName: formData.name,
                    commentPreview: newComment.substring(0, 50) + (newComment.length > 50 ? '...' : '')
                },
                currentUser
            );
        }
        
        // Save comment changes and activity log immediately - stay in edit mode
        // CRITICAL: Ensure comments are explicitly included in the save
        isAutoSavingRef.current = true;
        lastInlineSaveAtRef.current = Date.now();
        try {
            // CRITICAL: Explicitly ensure comments are in the data being saved
            const dataToSave = {
                ...updatedFormData,
                comments: updatedComments // Explicitly include comments
            };
            
            console.log('💾 Saving comment:', {
                leadId: dataToSave.id,
                commentsCount: dataToSave.comments?.length || 0,
                latestComment: dataToSave.comments?.[dataToSave.comments.length - 1]
            });
            
            await onSave(dataToSave, true);
            
            // CRITICAL: After a successful save, ensure we remain on the notes tab
            // Use setTimeout to ensure this happens after any potential re-renders
            // Use handleTabChange to ensure it persists to localStorage
            setTimeout(() => {
                handleTabChange('notes');
            }, 0);
        } catch (error) {
            console.error('❌ Error saving comment:', error);
            alert('Failed to save comment. Please try again.');
            // Revert the comment addition on error
            const revertedFormData = {
                ...formData,
                comments: formData.comments || []
            };
            setFormData(revertedFormData);
            formDataRef.current = revertedFormData;
        } finally {
            // Clear the flag after a delay to allow API response to propagate
            // This delay ensures any effects that check isAutoSavingRef won't reset the tab
            setTimeout(() => {
                isAutoSavingRef.current = false;
            }, TAB_PRESERVE_AFTER_INLINE_SAVE_MS);
        }
        
        // Clear form fields only after successful save (handled in try block)
        setNewComment('');
        setNewNoteTags([]);
        setNewNoteTagsInput('');
        setNewNoteAttachments([]);
        
    };

    const handleDeleteComment = (commentId) => {
        if (confirm('Delete this comment?')) {
            const updatedFormData = {
                ...formData,
                comments: formData.comments.filter(c => c.id !== commentId)
            };
            setFormData(updatedFormData);
            
            // Save comment deletion immediately - stay in edit mode
            isAutoSavingRef.current = true;
            lastInlineSaveAtRef.current = Date.now();
            Promise.resolve().then(() => onSave(updatedFormData, true)).then(() => {
                setTimeout(() => { handleTabChange('notes'); }, 0);
            }).finally(() => {
                setTimeout(() => { isAutoSavingRef.current = false; }, TAB_PRESERVE_AFTER_INLINE_SAVE_MS);
            });
            
        }
    };

    const handleUnsubscribeFromComments = async () => {
        const threadType = isLead ? 'lead' : 'client';
        const threadId = formData?.id;
        if (!threadId || !window.DatabaseAPI?.makeRequest) return;
        try {
            await window.DatabaseAPI.makeRequest(`/comment-subscriptions?threadType=${encodeURIComponent(threadType)}&threadId=${encodeURIComponent(threadId)}`, { method: 'DELETE' });
            setIsCommentSubscribed(false);
        } catch (e) {
            console.warn('Unsubscribe failed:', e?.message);
        }
    };

    const handleAddSite = async () => {
        if (!newSite.name) {
            alert('Site name is required');
            return;
        }
        const clientId = formData?.id;
        if (!clientId) {
            alert('Save the client first before adding sites.');
            return;
        }
        
        // Prevent tab from reverting to overview while adding a site (same as notes/comment flow)
        isAutoSavingRef.current = true;
        lastInlineSaveAtRef.current = Date.now();
        handleTabChange('sites');
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                isAutoSavingRef.current = false;
                alert('❌ Please log in to save sites to the database');
                return;
            }
            
            const payload = {
                name: newSite.name,
                address: newSite.address || '',
                contactPerson: newSite.contactPerson || '',
                contactPhone: newSite.phone || newSite.contactPhone || '',
                contactEmail: newSite.email || newSite.contactEmail || '',
                notes: newSite.notes || '',
                latitude: newSite.latitude || '',
                longitude: newSite.longitude || '',
                gpsCoordinates: newSite.gpsCoordinates || '',
                siteLead: newSite.siteLead ?? '',
                siteType: newSite.siteType === 'client' ? 'client' : 'lead',
                engagementStage: newSite.engagementStage ?? newSite.stage ?? 'Potential',
                aidaStatus: newSite.aidaStatus ?? 'Awareness'
            };
            let response;
            if (window.api?.createSite) {
                response = await window.api.createSite(clientId, payload);
            } else if (window.DatabaseAPI?.makeRequest) {
                response = await window.DatabaseAPI.makeRequest(`/sites/client/${clientId}`, { method: 'POST', body: JSON.stringify(payload) });
            } else {
                isAutoSavingRef.current = false;
                alert('❌ Site API not available. Please refresh the page.');
                return;
            }
            const rawSaved = response?.data?.site || response?.site || response;
            const savedSite = rawSaved && rawSaved.id ? {
                ...rawSaved,
                siteLead: rawSaved.siteLead ?? payload.siteLead ?? '',
                siteType: rawSaved.siteType ?? payload.siteType ?? 'lead',
                engagementStage: rawSaved.engagementStage ?? payload.engagementStage ?? rawSaved.stage ?? payload.stage ?? 'Potential',
                aidaStatus: rawSaved.aidaStatus ?? payload.aidaStatus ?? 'Awareness'
            } : rawSaved;
            
            if (savedSite && savedSite.id) {
                // Mark form as edited to prevent useEffect from resetting formData
                hasUserEditedForm.current = true;
                
                // Store clientId to avoid stale closure
                const clientId = formData.id;
                
                // Add to optimistic sites state - this triggers re-render and persists even if formData gets reset
                setOptimisticSites(prev => {
                    const siteExists = prev.some(s => s.id === savedSite.id);
                    if (siteExists) {
                        return prev;
                    }
                    const updated = [...prev, savedSite];
                    return updated;
                });
                
                // Optimistically update UI immediately - use functional update to get latest state
                let updatedFormDataAfterSite = null;
                setFormData(prev => {
                    const currentSites = prev.sites || [];
                    // Check if site already exists to avoid duplicates
                    const siteExists = currentSites.some(s => s.id === savedSite.id);
                    if (siteExists) {
                        return prev;
                    }
                    const updatedSites = [...currentSites, savedSite];
                    const newFormData = {
                        ...prev,
                        sites: updatedSites
                    };
                    updatedFormDataAfterSite = newFormData;
                    formDataRef.current = newFormData;
                    // Force React to see this as a new object reference
                    return newFormData;
                });
                
                // State update above will automatically trigger re-render
                
                const formDataForSiteActivity = updatedFormDataAfterSite || formDataRef.current || formData;
                const mergedSitesForActivity = mergeUniqueById(formDataForSiteActivity?.sites, [savedSite, ...optimisticSites]);
                const finalFormDataForSiteActivity = {
                    ...formDataForSiteActivity,
                    sites: mergedSitesForActivity
                };
                formDataRef.current = finalFormDataForSiteActivity;
                logActivity('Site Added', `Added site: ${newSite.name}`, null, true, finalFormDataForSiteActivity);
                
                // Switch to sites tab immediately
                handleTabChange('sites');
                
                // Close form and reset (default siteType by context: client vs lead)
                setNewSite({
                    name: '',
                    address: '',
                    contactPerson: '',
                    phone: '',
                    email: '',
                    notes: '',
                    latitude: '',
                    longitude: '',
                    gpsCoordinates: '',
                    siteLead: '',
                    siteType: isLead ? 'lead' : 'client',
                    engagementStage: 'Potential',
                    aidaStatus: 'Awareness'
                });
                setShowSiteForm(false);
                
                // Delay alert to ensure state update and render complete first
                setTimeout(() => {
                    alert('✅ Site saved to database successfully!');
                }, 100);
                
                // Clear auto-save flag after tab and UI have settled so tab-sync effects don't revert to overview
                setTimeout(() => {
                    isAutoSavingRef.current = false;
                }, TAB_PRESERVE_AFTER_INLINE_SAVE_MS);
                
            } else {
                throw new Error('No site ID returned from API');
            }
        } catch (error) {
            isAutoSavingRef.current = false;
            console.error('❌ Error creating site:', error);
            const errorMessage = error?.message || 'Unknown error';
            const details = (error && typeof error.details === 'string') ? error.details : '';
            const fullMessage = details ? (errorMessage + ' — ' + details) : errorMessage;
            const isServerError = errorMessage.includes('500') || errorMessage.includes('Internal Server Error') || errorMessage.includes('Failed to add site') || errorMessage.includes('Sites table not initialized');
            if (isServerError) {
                alert('❌ ' + (fullMessage || 'Unable to save site. This may be due to a database issue with this client. Please contact support if this persists.'));
            } else {
                alert('❌ Error saving site to database: ' + fullMessage);
            }
        }
    };

    const handleEditSite = (site) => {
        setEditingSite(site);
        setNewSite({
            ...site,
            phone: site.phone ?? site.contactPhone ?? '',
            email: site.email ?? site.contactEmail ?? '',
            siteLead: site.siteLead ?? '',
            siteType: site.siteType === 'client' ? 'client' : 'lead',
            engagementStage: site.engagementStage ?? site.stage ?? 'Potential',
            aidaStatus: site.aidaStatus ?? 'Awareness'
        });
        setShowSiteForm(true);
    };

    const openedInitialSiteIdRef = useRef(null);
    useEffect(() => {
        if (client?.id != null) openedInitialSiteIdRef.current = null;
    }, [client?.id]);
    useEffect(() => {
        if (!initialSiteId) return;
        // 1. Switch to Sites tab first so it mounts and (for leads) we load sites
        if (activeTabRef.current !== 'sites') {
            if (typeof onTabChange === 'function') onTabChange('sites');
            setActiveTab('sites');
            activeTabRef.current = 'sites';
            return; // Re-run after tab switch (and optionally sites load)
        }
        // 2. Only open the specific site when we're actually on Sites tab
        if (activeTab !== 'sites') return;
        const formSites = formData?.sites || [];
        const opt = optimisticSites || [];
        const siteMap = new Map();
        formSites.forEach(s => { if (s?.id) siteMap.set(String(s.id), s); });
        opt.forEach(s => { if (s?.id) siteMap.set(String(s.id), s); });
        const allSites = Array.from(siteMap.values());
        let site = siteMap.get(String(initialSiteId));
        if (!site && allSites.length === 1) site = allSites[0]; // Fallback: open single site when id mismatch
        if (!site) return; // Site not loaded yet – effect will re-run when formData.sites / optimisticSites updates
        if (openedInitialSiteIdRef.current === initialSiteId) return;
        openedInitialSiteIdRef.current = initialSiteId;
        // 3. Open the actual site (edit form). Don't clear initialSiteId here – clear only when user clicks "Back to list".
        handleEditSite(site);
    }, [initialSiteId, formData?.sites, optimisticSites, activeTab]);

    const openedInitialProposalIdRef = useRef(null);
    useEffect(() => {
        if (client?.id != null) openedInitialProposalIdRef.current = null;
    }, [client?.id]);
    useEffect(() => {
        if (!initialProposalId || !isLead || !canViewLeadProposals) return;
        const pid = String(initialProposalId).trim();
        if (!pid) return;
        if (activeTabRef.current !== 'proposals') {
            if (typeof onTabChange === 'function') onTabChange('proposals');
            setActiveTab('proposals');
            activeTabRef.current = 'proposals';
            return;
        }
        if (activeTab !== 'proposals') return;
        const list = Array.isArray(formData?.proposals) ? formData.proposals : [];
        const idx = list.findIndex((p) => p && String(p.id || '').trim() === pid);
        if (idx === -1) return;
        if (openedInitialProposalIdRef.current === pid) return;
        openedInitialProposalIdRef.current = pid;
        openLeadProposalWizardEdit(idx);
    }, [initialProposalId, isLead, canViewLeadProposals, formData?.proposals, activeTab, client?.id]);

    const handleUpdateSite = () => {
        // Build site payload with API-expected fields
        const sitePayload = {
            ...newSite,
            id: editingSite.id,
            contactPhone: newSite.contactPhone ?? newSite.phone ?? '',
            contactEmail: newSite.contactEmail ?? newSite.email ?? '',
            siteType: newSite.siteType === 'client' ? 'client' : 'lead',
            engagementStage: newSite.engagementStage ?? newSite.stage ?? 'Potential',
            aidaStatus: newSite.aidaStatus ?? 'Awareness'
        };
        const updatedSites = (formData.sites || []).map(s =>
            s.id === editingSite.id ? sitePayload : s
        );
        const updatedFormData = {...formData, sites: updatedSites};
        setFormData(updatedFormData);
        formDataRef.current = updatedFormData; // keep ref in sync so in-flight loadAllData doesn't overwrite with stale sites
        
        // Log activity and get updated formData with activity log
        const finalFormData = logActivity('Site Updated', `Updated site: ${newSite.name}`, null, false, updatedFormData);
        
        // Prevent tab from reverting to overview while saving (same as add site flow)
        isAutoSavingRef.current = true;
        lastInlineSaveAtRef.current = Date.now();

        // Persist site via direct site API so normalized ClientSite rows (incl. GPS) are saved.
        const runSave = async () => {
            let dataToSave = finalFormData;
            if (formData.id && editingSite.id && (window.api?.updateSite || window.DatabaseAPI?.makeRequest)) {
                const payload = {
                    name: sitePayload.name ?? '',
                    address: sitePayload.address ?? '',
                    contactPerson: sitePayload.contactPerson ?? '',
                    contactPhone: sitePayload.contactPhone ?? '',
                    contactEmail: sitePayload.contactEmail ?? '',
                    notes: sitePayload.notes ?? '',
                    latitude: sitePayload.latitude ?? '',
                    longitude: sitePayload.longitude ?? '',
                    gpsCoordinates: sitePayload.gpsCoordinates ?? '',
                    siteLead: sitePayload.siteLead ?? '',
                    siteType: sitePayload.siteType === 'client' ? 'client' : 'lead',
                    engagementStage: sitePayload.engagementStage ?? sitePayload.stage ?? '',
                    aidaStatus: sitePayload.aidaStatus ?? ''
                };
                try {
                    let response;
                    if (window.api?.updateSite) {
                        response = await window.api.updateSite(formData.id, editingSite.id, payload);
                    } else if (window.DatabaseAPI?.makeRequest) {
                        response = await window.DatabaseAPI.makeRequest(`/sites/client/${formData.id}/${editingSite.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify(payload)
                        });
                    }
                    const savedSite = response?.data?.site || response?.site;
                    if (savedSite?.id && savedSite.id !== editingSite.id) {
                        const updatedSitesList = (updatedFormData.sites || []).map(s => s.id === editingSite.id ? savedSite : s);
                        setFormData(prev => ({ ...prev, sites: (prev.sites || []).map(s => s.id === editingSite.id ? savedSite : s) }));
                        setOptimisticSites(prev => prev.map(s => s.id === editingSite.id ? savedSite : s));
                        dataToSave = { ...finalFormData, sites: updatedSitesList };
                    }
                } catch (err) {
                    console.error('❌ Site update (direct API) failed:', err);
                    alert('Site could not be saved to the database. Please try again.');
                    return;
                }
            }
            try {
                await onSave(dataToSave, true);
            } catch (e) {
                console.error('❌ Error in onSave after site update:', e);
            }
        };
        Promise.resolve().then(runSave).finally(() => {
            setTimeout(() => {
                isAutoSavingRef.current = false;
            }, TAB_PRESERVE_AFTER_INLINE_SAVE_MS);
        });
        
        setEditingSite(null);
            setNewSite({
                name: '',
                address: '',
                contactPerson: '',
                phone: '',
                email: '',
                notes: '',
                latitude: '',
                longitude: '',
                gpsCoordinates: '',
                siteLead: '',
                siteType: isLead ? 'lead' : 'client',
                engagementStage: 'Potential',
                aidaStatus: 'Awareness'
            });
        setShowSiteForm(false);
        // Stay in sites tab (use setTimeout to ensure it happens after re-render)
        setTimeout(() => {
            handleTabChange('sites');
        }, 100);
        
    };

    const handleDeleteSite = (siteId) => {
        const site = (formData.sites || []).find(s => s.id === siteId);
        if (!confirm('Delete this site?')) return;
        const prevFormData = formData;
        const updatedFormData = {
            ...formData,
            sites: (formData.sites || []).filter(s => s.id !== siteId)
        };
        setFormData(updatedFormData);
        formDataRef.current = updatedFormData;
        const finalFormData = logActivity('Site Deleted', `Deleted site: ${site?.name || 'Unknown'}`, null, false, updatedFormData);
        isAutoSavingRef.current = true;
        lastInlineSaveAtRef.current = Date.now();
        handleTabChange('sites');

        const runDelete = async () => {
            if (isLead && formData.id && siteId && (window.api?.deleteSite || window.DatabaseAPI?.makeRequest)) {
                try {
                    if (window.api?.deleteSite) {
                        await window.api.deleteSite(formData.id, siteId);
                    } else {
                        await window.DatabaseAPI.makeRequest(`/sites/client/${formData.id}/${siteId}`, { method: 'DELETE' });
                    }
                } catch (err) {
                    console.error('❌ Lead site delete (direct API) failed:', err);
                    alert('Site could not be deleted from the database. Please try again.');
                    setFormData(prevFormData);
                    formDataRef.current = prevFormData;
                    return;
                }
            }
            try {
                await onSave(finalFormData, true);
            } catch (e) {
                console.error('❌ Error in onSave after site delete:', e);
            }
        };
        Promise.resolve().then(runDelete).finally(() => {
            setTimeout(() => { isAutoSavingRef.current = false; }, TAB_PRESERVE_AFTER_INLINE_SAVE_MS);
        });
    };

    const handleAddOpportunity = async () => {
        if (!newOpportunity.name || !newOpportunity.name.trim()) {
            alert('Opportunity name is required');
            return;
        }
        
        try {
            const opportunityData = {
                title: newOpportunity.name,
                clientId: formData.id,
                aidaStatus: newOpportunity.aidaStatus || 'Awareness',
                engagementStage: newOpportunity.engagementStage || 'Potential',
                value: parseFloat(newOpportunity.value) || 0
            };
            
            
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('❌ Please log in to save opportunities to the database');
                return;
            }
            
            if (!window.api?.createOpportunity) {
                alert('❌ Opportunity API not available. Please refresh the page.');
                return;
            }
            
            
            const response = await window.api.createOpportunity(opportunityData);
            
            const savedOpportunity = response?.data?.opportunity || response?.opportunity || response;
            
            if (savedOpportunity && savedOpportunity.id) {
                // Get current user info
                const user = window.storage?.getUser?.() || {};
                const currentUser = {
                    name: user?.name || 'System',
                    email: user?.email || 'system',
                    id: user?.id || 'system'
                };
                
                // Use functional update to ensure we're working with latest state and update immediately
                setFormData(prev => {
                    // Add to local opportunities array for immediate UI update
                    const currentOpportunities = Array.isArray(prev.opportunities) ? prev.opportunities : [];
                    // Check if opportunity already exists to avoid duplicates
                    const opportunityExists = currentOpportunities.some(o => o.id === savedOpportunity.id);
                    if (opportunityExists) {
                        return prev;
                    }
                    
                    const updatedOpportunities = [...currentOpportunities, savedOpportunity];
                    
                    const newActivityLog = [...(prev.activityLog || []), {
                        id: Date.now() + 1,
                        type: 'Opportunity Added',
                        description: `Added opportunity: ${newOpportunity.name}`,
                        timestamp: new Date().toISOString(),
                        user: currentUser.name,
                        userId: currentUser.id,
                        userEmail: currentUser.email,
                        relatedId: savedOpportunity.id
                    }];
                    
                    return {
                        ...prev,
                        opportunities: updatedOpportunities,
                        activityLog: newActivityLog
                    };
                });
                
                // Reset form immediately
                setNewOpportunity({
                    name: '',
                    aidaStatus: 'Awareness',
                    engagementStage: 'Potential',
                    expectedCloseDate: '',
                    relatedSiteId: null,
                    notes: ''
                });
                setShowOpportunityForm(false);
                
                // Switch to opportunities tab to show the added opportunity
                // Use setTimeout to ensure state update is processed first
                setTimeout(() => {
                    handleTabChange('opportunities');
                }, 0);
                
                // DON'T call onSave here - it will overwrite the client with stale data!
                // Instead, just update local state and let the user save when they're ready
                // The opportunity is already in the database, so it will load on next fetch
                
                
                // Reload opportunities from database in background to ensure we have the latest
                // This will merge with the optimistic update
                try {
                    const oppResponse = await window.api.getOpportunitiesByClient(formData.id);
                    const freshOpportunities = oppResponse?.data?.opportunities || oppResponse?.opportunities || [];
                    
                    // Merge with existing opportunities, ensuring no duplicates
                    setFormData(prev => {
                        const existingIds = new Set((prev.opportunities || []).map(o => o.id));
                        const newOpportunities = freshOpportunities.filter(o => !existingIds.has(o.id));
                        const merged = [...(prev.opportunities || []), ...newOpportunities];
                        
                        return {
                            ...prev,
                            opportunities: merged
                        };
                    });
                    
                    
                    // Trigger a window event to notify Pipeline view that opportunities changed
                    window.dispatchEvent(new CustomEvent('opportunitiesUpdated', { 
                        detail: { clientId: formData.id, opportunities: freshOpportunities } 
                    }));
                } catch (error) {
                    console.error('❌ Failed to reload opportunities:', error);
                    // Don't show error to user - optimistic update already shows the opportunity
                }
            } else {
                throw new Error('No opportunity ID returned from API');
            }
        } catch (error) {
            console.error('❌ Error creating opportunity:', error);
            console.error('❌ Error details:', {
                message: error.message,
                stack: error.stack,
                response: error.response,
                data: error.data
            });
            alert('❌ Error saving opportunity to database: ' + (error.message || 'Unknown error'));
        }
    };

    const handleEditOpportunity = (opportunity) => {
        setEditingOpportunity(opportunity);
        setNewOpportunity(opportunity);
        setShowOpportunityForm(true);
    };

    const handleUpdateOpportunity = async () => {
        try {
            const opportunityData = {
                title: newOpportunity.name,
                aidaStatus: newOpportunity.aidaStatus ?? newOpportunity.stage ?? 'Awareness',
                engagementStage: newOpportunity.engagementStage ?? newOpportunity.status ?? 'Potential',
                value: parseFloat(newOpportunity.value) || 0
            };
            
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('❌ Please log in to update opportunities in the database');
                return;
            }
            
            if (!window.api?.updateOpportunity) {
                alert('❌ Opportunity API not available. Please refresh the page.');
                return;
            }
            
            const response = await window.api.updateOpportunity(editingOpportunity.id, opportunityData);
            const updatedOpportunity = response?.data?.opportunity || response?.opportunity || response;
            
            if (updatedOpportunity && updatedOpportunity.id) {
                // Update local opportunities array
                const updatedOpportunities = formData.opportunities.map(o => 
                    o.id === editingOpportunity.id ? updatedOpportunity : o
                );
                const updatedFormData = {...formData, opportunities: updatedOpportunities};
                setFormData(updatedFormData);
                
                // Log activity and auto-save (activity log will be saved automatically)
                logActivity('Opportunity Updated', `Updated opportunity: ${newOpportunity.name}`, null, true, updatedFormData);
                
                alert('✅ Opportunity updated in database successfully!');
                
                setEditingOpportunity(null);
                setNewOpportunity({
                    name: '',
                    aidaStatus: 'Awareness',
                    engagementStage: 'Potential',
                    expectedCloseDate: '',
                    relatedSiteId: null,
                    notes: ''
                });
                setShowOpportunityForm(false);
                
            } else {
                throw new Error('No opportunity data returned from API');
            }
        } catch (error) {
            console.error('❌ Error updating opportunity:', error);
            alert('❌ Error updating opportunity in database: ' + error.message);
        }
    };

    const handleDeleteOpportunity = async (opportunityId) => {
        const opportunity = formData.opportunities.find(o => o.id === opportunityId);
        if (!opportunity) {
            alert('❌ Opportunity not found in local data. It may have already been deleted.');
            return;
        }
        
        if (confirm(`Delete opportunity "${opportunity.name || opportunityId}"?`)) {
            try {
                const token = window.storage?.getToken?.();
                if (!token) {
                    alert('❌ Please log in to delete opportunities from the database');
                    return;
                }
                
                if (!window.api?.deleteOpportunity) {
                    alert('❌ Opportunity API not available. Please refresh the page.');
                    return;
                }
                
                console.log(`🗑️ Deleting opportunity: ${opportunityId}`);
                
                // Call API to delete from database
                await window.api.deleteOpportunity(opportunityId);
                
                console.log(`✅ Opportunity ${opportunityId} deleted from database`);
                
                // CRITICAL: Reload opportunities from database to ensure UI matches database state
                // This prevents stale data and handles cases where the opportunity was already deleted
                if (client?.id) {
                    console.log(`🔄 Reloading opportunities after deletion for client: ${client.id}`);
                    await loadOpportunitiesFromDatabase(client.id);
                } else {
                    // Fallback: Update local state if client ID not available
                    const updatedFormData = {
                        ...formData,
                        opportunities: formData.opportunities.filter(o => o.id !== opportunityId)
                    };
                    setFormData(updatedFormData);
                }
                
                // Log activity and auto-save (activity log will be saved automatically)
                const currentFormData = formDataRef.current || formData;
                logActivity('Opportunity Deleted', `Deleted opportunity: ${opportunity?.name}`, null, true, currentFormData);
                
                alert('✅ Opportunity deleted from database successfully!');
                
            } catch (error) {
                console.error('❌ Error deleting opportunity:', error);
                
                // Check if error is 404 (opportunity not found)
                const isNotFound = error.status === 404 || error.message?.includes('404') || error.message?.includes('not found');
                
                if (isNotFound) {
                    // Opportunity not found in database - reload opportunities to sync UI
                    console.log(`⚠️ Opportunity ${opportunityId} not found in database. Reloading opportunities to sync UI.`);
                    if (client?.id) {
                        await loadOpportunitiesFromDatabase(client.id);
                    }
                    alert('⚠️ Opportunity not found in database. It may have already been deleted. Refreshing list...');
                } else {
                    alert('❌ Error deleting opportunity from database: ' + error.message);
                }
            }
        }
    };

    const logActivity = (type, description, relatedId = null, autoSave = true, formDataToUpdate = null) => {
        // Get current user info
        const user = window.storage?.getUser?.() || {};
        const currentUser = {
            name: user?.name || 'System',
            email: user?.email || 'system',
            id: user?.id || 'system'
        };
        
        const activity = {
            id: Date.now(),
            type,
            description,
            timestamp: new Date().toISOString(),
            user: currentUser.name,
            userId: currentUser.id,
            userEmail: currentUser.email,
            relatedId
        };
        
        // Use provided formData or current formData
        const baseFormData = formDataToUpdate || formDataRef.current || formData;
        const updatedFormData = {
            ...baseFormData,
            activityLog: [...(baseFormData.activityLog || []), activity]
        };
        
        setFormData(updatedFormData);
        formDataRef.current = updatedFormData;
        
        // Auto-save activity log to database if enabled (default: true)
        if (autoSave && client && onSave) {
            isAutoSavingRef.current = true;
            // Don't await - let it run in background to avoid blocking UI
            onSave(updatedFormData, true).finally(() => {
                // Clear flag immediately after save completes (no artificial delay)
                isAutoSavingRef.current = false;
            });
        }
        
        // Return updated formData so callers can use it if needed
        return updatedFormData;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isSubmitting) return;
        setIsSubmitting(true);
        hasUserEditedForm.current = false; // Reset after save
        // Use formDataRef so we always send the latest (e.g. KYC tab edits) even if state hasn't flushed
        const latest = formDataRef.current || formData;
        const clientData = {
            ...latest,
            lastContact: new Date().toISOString().split('T')[0]
        };
        
        // CRITICAL: Set flag to prevent immediate overwriting after save
        justSavedRef.current = true;
        saveTimestampRef.current = Date.now();
        
        try {
            if (onUpdate && client) {
                await onUpdate(clientData);
            } else {
                await onSave(clientData, false);
            }
        } finally {
            setIsSubmitting(false);
            setTimeout(() => {
                justSavedRef.current = false;
            }, 3000);
        }
    };

    // Get projects that belong to this client (match by clientId or clientName)
    const clientProjects = React.useMemo(() => {
        if (!allProjects || !Array.isArray(allProjects) || allProjects.length === 0) {
            return [];
        }
        if (!formData || !formData.id && !formData.name) {
            return [];
        }
        
        return allProjects.filter(p => {
            if (!p) return false;
            
            // Primary: match by clientId (foreign key relationship)
            if (formData.id && p.clientId && p.clientId === formData.id) {
                return true;
            }
            // Fallback: match by client name (for projects without clientId set)
            // Use case-insensitive comparison and trim whitespace
            const clientName = (formData.name || '').trim().toLowerCase();
            const projectClient = (p.client || '').trim().toLowerCase();
            const projectClientName = (p.clientName || '').trim().toLowerCase();
            
            if (clientName && (projectClient === clientName || projectClientName === clientName)) {
                return true;
            }
            return false;
        });
    }, [allProjects, formData?.id, formData?.name]);
    const upcomingFollowUps = (formData.followUps || [])
        .filter(f => !f.completed)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    // Navigation helper function
    const navigateToPage = (page) => {
        // If navigating to clients page, reset the Clients component view first
        if (page === 'clients') {
            if (window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent('resetClientsView', { detail: {} }));
            }
        }
        
        // Navigate using RouteState
        if (window.RouteState && window.RouteState.navigate) {
            window.RouteState.navigate({
                page: page,
                segments: [],
                search: '',
                hash: '',
                replace: false,
                preserveSearch: false,
                preserveHash: false
            });
        } else if (window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('navigateToPage', { 
                detail: { page: page } 
            }));
        }
        
        // Close modal when navigating away (handleClose saves KYC first when on that tab)
        handleClose();
    };

    return (
            <div
                className={
                    isFullPage
                        ? `relative flex flex-col flex-1 min-h-0 w-full ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`
                        : 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4'
                }
            >
                <div
                    className={`${isDark ? 'bg-gray-800' : 'bg-white'} ${
                        isFullPage
                            ? 'relative flex flex-col flex-1 min-h-0 w-full rounded-none overflow-hidden'
                            : 'rounded-lg w-full max-w-5xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden'
                    } flex flex-col`}
                >
                    {/* Breadcrumb Navigation */}
                    {isFullPage && (
                        <div className={`px-3 sm:px-6 py-2 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                            <nav className="flex items-center space-x-2 text-sm">
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleClose();
                                    }}
                                    className={`${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'} flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 mr-2`}
                                    title="Go back"
                                >
                                    <i className="fas fa-arrow-left"></i>
                                </button>
                                <button
                                    onClick={() => navigateToPage('dashboard')}
                                    className={`${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900'} transition-colors`}
                                >
                                    <i className="fas fa-home mr-1"></i>
                                    Dashboard
                                </button>
                                <i className={`fas fa-chevron-right ${isDark ? 'text-gray-600' : 'text-gray-400'}`}></i>
                                <button
                                    onClick={() => {
                                        // If on a lead detail page, switch to leads view; if on client detail, switch to clients view
                                        const targetView = isLead ? 'leads' : 'clients';
                                        if (window.dispatchEvent) {
                                            window.dispatchEvent(new CustomEvent('resetClientsView', { 
                                                detail: { viewMode: targetView } 
                                            }));
                                        }
                                        handleClose();
                                    }}
                                    className={`${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900'} transition-colors`}
                                >
                                    {isLead ? 'Leads' : 'Clients'}
                                </button>
                                {client && (
                                    <>
                                        <i className={`fas fa-chevron-right ${isDark ? 'text-gray-600' : 'text-gray-400'}`}></i>
                                        <span className={`${isDark ? 'text-gray-300' : 'text-gray-900'} font-medium`}>
                                            {formData.name}
                                        </span>
                                    </>
                                )}
                            </nav>
                        </div>
                    )}
                    {/* Header */}
                    <div className={`flex justify-between items-center px-3 sm:px-6 py-3 sm:py-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                        <div className="min-w-0 flex-1 inline-flex flex-row flex-nowrap items-center gap-2">
                            {client && (
                                <button
                                    onClick={async (e) => {
                                        e.stopPropagation();
                                        const currentStarred = client.isStarred || false;
                                        try {
                                            if (window.DatabaseAPI && typeof window.DatabaseAPI.toggleStarClient === 'function') {
                                                await window.DatabaseAPI.toggleStarClient(client.id);
                                                // Update local state
                                                if (onUpdate) {
                                                    onUpdate({ ...client, isStarred: !currentStarred });
                                                }
                                            }
                                        } catch (error) {
                                            console.error('❌ Failed to toggle star:', error);
                                        }
                                    }}
                                    className={`flex-shrink-0 transition-colors ${isDark ? 'hover:text-yellow-400' : 'hover:text-yellow-600'}`}
                                    title={client.isStarred ? 'Unstar this client' : 'Star this client'}
                                >
                                    <i className={`${client.isStarred ? 'fas' : 'far'} fa-star ${client.isStarred ? 'text-yellow-500' : isDark ? 'text-white' : 'text-gray-300'}`}></i>
                                </button>
                            )}
                            {(formData.thumbnail || (client && client.thumbnail)) ? (
                                <div className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden border-2 border-gray-200 bg-white flex items-center justify-center">
                                    <img src={formData.thumbnail || client.thumbnail} alt="" className="w-full h-full object-contain" onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling?.classList.remove('hidden'); }} />
                                    <i className="fas fa-building hidden text-gray-400 text-lg" aria-hidden></i>
                                </div>
                            ) : null}
                            <div className="min-w-0 flex-1">
                                <h2 className={`text-lg sm:text-xl font-semibold truncate ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                    {client ? formData.name : `Add New ${entityLabel}`}
                                </h2>
                                {client && (
                                    <p className={`text-xs sm:text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} mt-0.5 truncate`}>
                                        {formData.industry} • {formData.status}
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="inline-flex flex-row flex-nowrap items-center gap-2 shrink-0">
                            {/* Quick Navigation Menu */}
                            {isFullPage && (
                                <div className="relative group">
                                    <button
                                        className={`${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'} p-2 rounded transition-colors`}
                                        title="Navigate to other pages"
                                    >
                                        <i className="fas fa-compass text-lg"></i>
                                    </button>
                                    <div className={`absolute right-0 top-full mt-1 w-48 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg shadow-lg z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200`}>
                                        <div className="py-1">
                                            <button
                                                onClick={() => navigateToPage('dashboard')}
                                                className={`w-full text-left px-4 py-2 text-sm ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'} transition-colors`}
                                            >
                                                <i className="fas fa-home mr-2"></i>
                                                Dashboard
                                            </button>
                                            <button
                                                onClick={() => navigateToPage('projects')}
                                                className={`w-full text-left px-4 py-2 text-sm ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'} transition-colors`}
                                            >
                                                <i className="fas fa-folder-open mr-2"></i>
                                                Projects
                                            </button>
                                            <button
                                                onClick={() => navigateToPage('tasks')}
                                                className={`w-full text-left px-4 py-2 text-sm ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'} transition-colors`}
                                            >
                                                <i className="fas fa-tasks mr-2"></i>
                                                Tasks
                                            </button>
                                            <button
                                                onClick={() => navigateToPage('clients')}
                                                className={`w-full text-left px-4 py-2 text-sm ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'} transition-colors`}
                                            >
                                                <i className="fas fa-building mr-2"></i>
                                                {isLead ? 'Leads' : 'Clients'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {!isFullPage && (
                                <button 
                                    onClick={handleClose} 
                                    className={`${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'} p-2 rounded transition-colors`}
                                >
                                    <i className="fas fa-times text-lg"></i>
                                </button>
                            )}
                        </div>
                    </div>

                {/* Tabs */}
                <div className={`border-b ${isDark ? 'border-gray-700' : 'border-gray-200'} px-3 sm:px-6`}>
                    <div
                        className={`inline-flex flex-row flex-nowrap w-full min-w-0 max-w-full ${isFullPage ? 'gap-4 sm:gap-8' : 'gap-2 sm:gap-6'} overflow-x-auto scrollbar-hide touch-pan-x`}
                        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                        role="tablist"
                        aria-label="Client or lead sections"
                    >
                        {(() => {
                            // For new clients/leads (client is null), only show overview tab
                            if (!client) {
                                return ['overview'];
                            }
                            
                            // Determine if lead has been converted to client
                            const isConverted = !isLead || formData.type === 'client';
                            
                            // Base — Proposals is appended last (after client-only tabs) for leads
                            const baseTabs = isLead
                                ? ['overview', 'contacts', 'sites', 'calendar', 'activity', 'notes', 'kyc']
                                : ['overview', 'contacts', 'sites', 'calendar', 'activity', 'notes', 'kyc'];
                            
                            // Tabs that should only show for clients or converted leads
                            const clientOnlyTabs = [];
                            if (isConverted) {
                                clientOnlyTabs.push('opportunities', 'projects', 'service-maintenance');
                                if (canViewContracts) {
                                    clientOnlyTabs.push('contracts');
                                }
                            }
                            
                            const proposalTabs = isLead && canViewLeadProposals ? ['proposals'] : [];
                            const allTabs = [...baseTabs, ...clientOnlyTabs, ...proposalTabs];
                            
                            return allTabs;
                        })().map(tab => (
                            <button
                                key={tab}
                                type="button"
                                onClick={() => handleTabChange(tab)}
                                className={`${isFullPage ? 'py-4 px-2' : 'py-3'} text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 min-w-fit ${
                                    activeTab === tab
                                        ? 'border-primary-600 text-primary-600'
                                        : isDark 
                                            ? 'border-transparent text-gray-400 hover:text-gray-200' 
                                            : 'border-transparent text-gray-600 hover:text-gray-900'
                                }`}
                                style={{ minWidth: 'max-content' }}
                            >
                                <i className={`fas fa-${
                                    tab === 'overview' ? 'info-circle' :
                                    tab === 'contacts' ? 'users' :
                                    tab === 'sites' ? 'map-marker-alt' :
                                    tab === 'opportunities' ? 'bullseye' :
                                    tab === 'calendar' ? 'calendar-alt' :
                                    tab === 'projects' ? 'folder-open' :
                                    tab === 'service-maintenance' ? 'wrench' :
                                    tab === 'contracts' ? 'file-contract' :
                                    tab === 'proposals' ? 'clipboard-list' :
                                    tab === 'activity' ? 'history' :
                                    tab === 'kyc' ? 'id-card' :
                                    'comment-alt'
                                } mr-1 sm:mr-2`}></i>
                                <span className="hidden sm:inline">{tab === 'service-maintenance' ? 'Service & Maintenance' : tab === 'kyc' ? 'KYC' : (tab.charAt(0).toUpperCase() + tab.slice(1).replace(/-/g, ' '))}</span>
                                <span className="sm:hidden">{tab === 'service-maintenance' ? 'S&M' : tab === 'kyc' ? 'KYC' : tab.charAt(0).toUpperCase()}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div ref={contentScrollableRef} className={`flex-1 overflow-y-auto ${isFullPage ? 'p-8' : 'p-6'}`}>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Overview Tab */}
                        {activeTab === 'overview' && (
                            <div className="space-y-4">
                                <div className={`grid grid-cols-1 ${isFullPage ? 'md:grid-cols-3 gap-6' : 'md:grid-cols-2 gap-4'}`}>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                            Entity Name *
                                        </label>
                                        <input 
                                            type="text" 
                                            value={formData.name}
                                            onFocus={() => {
                                                isEditingRef.current = true;
                                                userHasStartedTypingRef.current = true;
                                                if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                            }}
                                            onChange={(e) => {
                                                // CRITICAL: Mark that user has started typing and edited this field
                                                userHasStartedTypingRef.current = true;
                                                isEditingRef.current = true;
                                                hasUserEditedForm.current = true; // Mark that user has edited
                                                userEditedFieldsRef.current.add('name'); // Track that user has edited this field
                                                if (onEditingChange) onEditingChange(true);
                                                if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                                editingTimeoutRef.current = setTimeout(() => {
                                                    isEditingRef.current = false;
                                                    if (onEditingChange) onEditingChange(false);
                                                }, 5000); // Clear editing flag 5 seconds after user stops typing (longer to prevent overwrites)
                                                setFormData(prev => {
                                                    const updated = {...prev, name: e.target.value};
                                                    // CRITICAL: Sync formDataRef IMMEDIATELY so guards can check current value
                                                    formDataRef.current = updated;
                                                    return updated;
                                                });
                                            }}
                                            onBlur={() => {
                                                setTimeout(() => {
                                                    isEditingRef.current = false;
                                                }, 500);
                                            }}
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                                            required 
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Industry</label>
                                        <select
                                            value={formData.industry}
                                            onFocus={() => {
                                                isEditingRef.current = true;
                                                userHasStartedTypingRef.current = true;
                                                if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                            }}
                                        onChange={(e) => {
                                            // CRITICAL: Mark that user has started typing and edited this field
                                            userHasStartedTypingRef.current = true;
                                            isEditingRef.current = true;
                                            hasUserEditedForm.current = true; // Mark that user has edited
                                            userEditedFieldsRef.current.add('industry'); // Track that user has edited this field
                                            if (onEditingChange) onEditingChange(true);
                                            if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                            editingTimeoutRef.current = setTimeout(() => {
                                                isEditingRef.current = false;
                                                if (onEditingChange) onEditingChange(false);
                                            }, 5000); // Clear editing flag 5 seconds after user stops typing
                                            setFormData(prev => {
                                                const updated = {...prev, industry: e.target.value};
                                                // CRITICAL: Sync formDataRef IMMEDIATELY so guards can check current value
                                                formDataRef.current = updated;
                                                return updated;
                                            });
                                        }}
                                            onBlur={() => {
                                                setTimeout(() => {
                                                    isEditingRef.current = false;
                                                }, 500);
                                            }}
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                        >
                                            <option value="">Select Industry</option>
                                            {industries.map((industry) => (
                                                <option key={industry.id} value={industry.name}>
                                                    {industry.name}
                                                </option>
                                            ))}
                                            {industries.length === 0 && (
                                                <>
                                                    <option>Mining</option>
                                                    <option>Mining Contractor</option>
                                                    <option>Forestry</option>
                                                    <option>Agriculture</option>
                                                    <option>Diesel Supply</option>
                                                    <option>Logistics</option>
                                                    <option>Other</option>
                                                </>
                                            )}
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {!isLead && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
                                            <select 
                                                value={normalizeClientAccountStatus(formData.status ?? formData.engagementStage)}
                                                onFocus={() => {
                                                    isEditingRef.current = true;
                                                    userHasStartedTypingRef.current = true;
                                                    if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                                }}
                                            onChange={async (e) => {
                                                const newStatus = e.target.value;
                                                isEditingRef.current = true;
                                                hasUserEditedForm.current = true; // Mark that user has edited
                                                userEditedFieldsRef.current.add('status'); // Track that user has edited this field
                                                if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                                editingTimeoutRef.current = setTimeout(() => {
                                                    isEditingRef.current = false;
                                                }, 5000); // Clear editing flag 5 seconds after user stops typing
                                                
                                                // CRITICAL: Set auto-saving flags IMMEDIATELY before any setTimeout
                                                // This prevents LiveDataSync from overwriting during the delay
                                                isAutoSavingRef.current = true;
                                                if (onEditingChange) onEditingChange(false, true);
                                                
                                                setFormData(prev => {
                                                    const engagementStage = clientEngagementStageFromAccountStatus(newStatus);
                                                    const updated = {...prev, status: newStatus, engagementStage};
                                                    formDataRef.current = updated;
                                                    
                                                    // Auto-save immediately with the updated data
                                                    // CRITICAL: Only auto-save for existing entities, NOT for new ones that haven't been saved yet
                                                    if (client && client.id && onSave) {
                                                        console.log('💾 Auto-saving status change:', {
                                                            entityId: client.id,
                                                            entityType: entityType,
                                                            oldStatus: formDataRef.current?.status,
                                                            newStatus: newStatus
                                                        });
                                                        
                                                        // Use setTimeout to ensure state is updated
                                                        setTimeout(async () => {
                                                            try {
                                                                // Get the latest formData from ref (updated by useEffect)
                                                                const latest = {...formDataRef.current, status: newStatus, engagementStage};
                                                                
                                                                // Explicitly ensure status is included
                                                                latest.status = newStatus;
                                                                latest.engagementStage = engagementStage;
                                                                
                                                                // For leads, also ensure stage is mapped from aidaStatus if needed
                                                                if (isLead && latest.aidaStatus && !latest.stage) {
                                                                    latest.stage = latest.aidaStatus;
                                                                }
                                                                
                                                                console.log('💾 Sending status to onSave:', {
                                                                    entityId: latest.id,
                                                                    status: latest.status,
                                                                    stage: latest.stage,
                                                                    aidaStatus: latest.aidaStatus
                                                                });
                                                                
                                                                // Save this as the last saved state
                                                                lastSavedDataRef.current = latest;
                                                                
                                                                // Save to API - ensure it's awaited
                                                                await onSave(latest, true);
                                                                
                                                                console.log('✅ Status auto-save completed');
                                                                
                                                                // Clear the flag and notify parent after save completes
                                                                setTimeout(() => {
                                                                    isAutoSavingRef.current = false;
                                                                    if (onEditingChange) onEditingChange(false, false);
                                                                }, TAB_PRESERVE_AFTER_INLINE_SAVE_MS);
                                                            } catch (error) {
                                                                console.error('❌ Error saving status:', error);
                                                                isAutoSavingRef.current = false;
                                                                if (onEditingChange) onEditingChange(false, false);
                                                                alert('Failed to save status change. Please try again.');
                                                            }
                                                        }, 100); // Small delay to ensure state update is processed
                                                    }
                                                    
                                                    return updated;
                                                });
                                            }}
                                                onBlur={() => {
                                                    setTimeout(() => {
                                                        isEditingRef.current = false;
                                                    }, 500);
                                                }}
                                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                            >
                                                <option value="Active">Active</option>
                                                <option value="Inactive">Inactive</option>
                                            </select>
                                        </div>
                                    )}
                                    {isLead && (() => {
                                        const leadHasSites = Array.isArray(formData.sites) && formData.sites.length > 0;
                                        return (
                                        <>
                                        {leadHasSites && (
                                            <p className="text-sm text-gray-500 italic col-span-full mb-1">Lead Status' managed at site level</p>
                                        )}
                                        <div>
                                            <label className={`block text-sm font-medium mb-1.5 ${leadHasSites ? 'text-gray-400' : 'text-gray-700'}`}>AIDA Status</label>
                                            <select 
                                                disabled={leadHasSites}
                                                value={formData.aidaStatus || 'Awareness'}
                                                onFocus={() => {
                                                    isEditingRef.current = true;
                                                    userHasStartedTypingRef.current = true;
                                                    if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                                }}
                                                onChange={async (e) => {
                                                    const newAidaStatus = e.target.value;
                                                    isEditingRef.current = true;
                                                    hasUserEditedForm.current = true;
                                                    userEditedFieldsRef.current.add('aidaStatus');
                                                    if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                                    editingTimeoutRef.current = setTimeout(() => {
                                                        isEditingRef.current = false;
                                                    }, 5000);
                                                    
                                                    // CRITICAL: Set auto-saving flags IMMEDIATELY before any setTimeout
                                                    // This prevents LiveDataSync from overwriting during the delay
                                                    isAutoSavingRef.current = true;
                                                    if (onEditingChange) onEditingChange(false, true);
                                                    
                                                    setFormData(prev => {
                                                        const updated = {
                                                            ...prev,
                                                            aidaStatus: newAidaStatus,
                                                            stage: newAidaStatus
                                                        };
                                                        formDataRef.current = updated;
                                                        
                                                        // Auto-save immediately with the updated data
                                                        // CRITICAL: Only auto-save for existing entities, NOT for new ones that haven't been saved yet
                                                        if (client && client.id && onSave) {
                                                            console.log('💾 Auto-saving AIDA Status change:', {
                                                                entityId: client.id,
                                                                entityType: entityType,
                                                                oldAidaStatus: formDataRef.current?.aidaStatus,
                                                                newAidaStatus: newAidaStatus
                                                            });
                                                            
                                                            // Use setTimeout to ensure state is updated
                                                            setTimeout(async () => {
                                                                try {
                                                                    // Get the latest formData from ref (updated by useEffect)
                                                                    const latest = {...formDataRef.current, aidaStatus: newAidaStatus};
                                                                    
                                                                    // CRITICAL: Map aidaStatus to stage for database
                                                                    // The database field is 'stage', but formData uses 'aidaStatus'
                                                                    latest.stage = newAidaStatus;
                                                                    
                                                                    console.log('💾 Sending AIDA Status to onSave (mapped to stage):', {
                                                                        entityId: latest.id,
                                                                        status: latest.status,
                                                                        stage: latest.stage,
                                                                        aidaStatus: latest.aidaStatus
                                                                    });
                                                                    
                                                                    // Save this as the last saved state
                                                                    lastSavedDataRef.current = latest;
                                                                    
                                                                    // Save to API - ensure it's awaited
                                                                    await onSave(latest, true);
                                                                    
                                                                    console.log('✅ AIDA Status auto-save completed');
                                                                    
                                                                    // Clear the flag and notify parent after save completes
                                                                    setTimeout(() => {
                                                                        isAutoSavingRef.current = false;
                                                                        if (onEditingChange) onEditingChange(false, false);
                                                                    }, TAB_PRESERVE_AFTER_INLINE_SAVE_MS);
                                                                } catch (error) {
                                                                    console.error('❌ Error saving AIDA Status:', error);
                                                                    isAutoSavingRef.current = false;
                                                                    if (onEditingChange) onEditingChange(false, false);
                                                                    alert('Failed to save AIDA Status change. Please try again.');
                                                                }
                                                            }, 100); // Small delay to ensure state update is processed
                                                        }
                                                        
                                                        return updated;
                                                    });
                                                }}
                                                onBlur={() => {
                                                    setTimeout(() => {
                                                        isEditingRef.current = false;
                                                    }, 500);
                                                }}
                                                className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${leadHasSites ? 'border-gray-200 bg-gray-100 text-gray-500 cursor-not-allowed' : 'border-gray-300'}`}
                                            >
                                                <option value="No Engagement">No Engagement</option>
                                                <option value="Awareness">Awareness</option>
                                                <option value="Interest">Interest</option>
                                                <option value="Desire">Desire</option>
                                                <option value="Action">Action</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className={`block text-sm font-medium mb-1.5 ${leadHasSites ? 'text-gray-400' : 'text-gray-700'}`}>Engagement Stage</label>
                                            <select
                                                disabled={leadHasSites} 
                                                value={formData.engagementStage ?? formData.status ?? 'Potential'}
                                                onFocus={() => {
                                                    isEditingRef.current = true;
                                                    userHasStartedTypingRef.current = true;
                                                    if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                                }}
                                                onChange={async (e) => {
                                                    const newStage = e.target.value;
                                                    isEditingRef.current = true;
                                                    hasUserEditedForm.current = true;
                                                    userEditedFieldsRef.current.add('engagementStage');
                                                    userEditedFieldsRef.current.add('status');
                                                    if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                                    editingTimeoutRef.current = setTimeout(() => {
                                                        isEditingRef.current = false;
                                                    }, 5000);
                                                    
                                                    isAutoSavingRef.current = true;
                                                    if (onEditingChange) onEditingChange(false, true);
                                                    
                                                    setFormData(prev => {
                                                        const updated = { ...prev, engagementStage: newStage, status: newStage };
                                                        formDataRef.current = updated;
                                                        if (client && client.id && onSave) {
                                                            setTimeout(async () => {
                                                                try {
                                                                    const latest = { ...formDataRef.current, engagementStage: newStage, status: newStage };
                                                                    if (isLead && latest.aidaStatus && !latest.stage) {
                                                                        latest.stage = latest.aidaStatus;
                                                                    }
                                                                    lastSavedDataRef.current = latest;
                                                                    await onSave(latest, true);
                                                                    setTimeout(() => {
                                                                        isAutoSavingRef.current = false;
                                                                        if (onEditingChange) onEditingChange(false, false);
                                                                    }, TAB_PRESERVE_AFTER_INLINE_SAVE_MS);
                                                                } catch (error) {
                                                                    console.error('❌ Error saving lead stage:', error);
                                                                    isAutoSavingRef.current = false;
                                                                    if (onEditingChange) onEditingChange(false, false);
                                                                    alert('Failed to save stage change. Please try again.');
                                                                }
                                                            }, 100);
                                                        }
                                                        return updated;
                                                    });
                                                }}
                                                onBlur={() => {
                                                    setTimeout(() => {
                                                        isEditingRef.current = false;
                                                    }, 500);
                                                }}
                                                className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${leadHasSites ? 'border-gray-200 bg-gray-100 text-gray-500 cursor-not-allowed' : 'border-gray-300'}`}
                                            >
                                                <option value="Disinterested">Disinterested</option>
                                                <option value="Potential">Potential</option>
                                                <option value="Active">Active</option>
                                                <option value="Proposal">Proposal</option>
                                                <option value="Tender">Tender</option>
                                            </select>
                                        </div>
                                        </>
                                        );
                                    })()}
                                    {isLead && (
                                        <div>
                                            <div className="flex items-center justify-between mb-1.5">
                                                <label className="block text-sm font-medium text-gray-700">External Agent</label>
                                                {isAdmin && (
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                setShowManageExternalAgentsModal(true);
                                                            }}
                                                            className="text-xs px-2 py-1 text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded transition-colors flex items-center gap-1"
                                                            title="Manage External Agents (Admin Only)"
                                                        >
                                                            <i className="fas fa-cog text-xs"></i>
                                                            <span>Manage</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                setShowExternalAgentModal(true);
                                                            }}
                                                            className="text-xs px-2 py-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors flex items-center gap-1"
                                                            title="Add New External Agent (Admin Only)"
                                                        >
                                                            <i className="fas fa-plus text-xs"></i>
                                                            <span>Add New</span>
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            <select
                                                value={String(formData.externalAgentId ?? formData.externalAgent?.id ?? '')}
                                                onFocus={() => {
                                                    isEditingRef.current = true;
                                                    userHasStartedTypingRef.current = true;
                                                    if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                                }}
                                                onChange={(e) => {
                                                    const newExternalAgentId = e.target.value || null;
                                                    isEditingRef.current = true;
                                                    hasUserEditedForm.current = true;
                                                    userEditedFieldsRef.current.add('externalAgentId');
                                                    if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                                    editingTimeoutRef.current = setTimeout(() => {
                                                        isEditingRef.current = false;
                                                    }, 5000);
                                                    
                                                    setFormData(prev => {
                                                        const updated = {
                                                            ...prev,
                                                            externalAgentId: newExternalAgentId,
                                                            externalAgent: newExternalAgentId 
                                                                ? externalAgents.find(agent => agent.id === newExternalAgentId) 
                                                                : null
                                                        };
                                                        formDataRef.current = updated;
                                                        
                                                        // Auto-save immediately with the updated data
                                                        // CRITICAL: Only auto-save for existing entities, NOT for new ones that haven't been saved yet
                                                        if (client && client.id && onSave) {
                                                            setTimeout(async () => {
                                                                try {
                                                                    const latest = {...formDataRef.current, externalAgentId: newExternalAgentId};
                                                                    lastSavedDataRef.current = latest;
                                                                    await onSave(latest, true);
                                                                } catch (error) {
                                                                    console.error('❌ Error saving External Agent:', error);
                                                                    alert('Failed to save External Agent change. Please try again.');
                                                                }
                                                            }, 100);
                                                        }
                                                        
                                                        return updated;
                                                    });
                                                }}
                                                onBlur={() => {
                                                    setTimeout(() => {
                                                        isEditingRef.current = false;
                                                    }, 500);
                                                }}
                                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                            >
                                                <option value="">Select External Agent</option>
                                                {/* Show current agent name immediately before options load (avoids ~1s blank while loadExternalAgents runs) */}
                                                {(() => {
                                                    const currentId = formData.externalAgentId ?? formData.externalAgent?.id;
                                                    const currentName = formData.externalAgent?.name;
                                                    const hasOptionForCurrent = currentId != null && externalAgents.some(a => String(a.id) === String(currentId));
                                                    if (currentId && !hasOptionForCurrent && currentName) {
                                                        return <option value={String(currentId)}>{currentName}</option>;
                                                    }
                                                    if (currentId && !hasOptionForCurrent) {
                                                        return <option value={String(currentId)}>Loading...</option>;
                                                    }
                                                    return null;
                                                })()}
                                                {externalAgents.map((agent) => (
                                                    <option key={agent.id} value={String(agent.id)}>
                                                        {agent.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Website</label>
                                        <div className="flex items-start gap-2">
                                            <div className="flex-1 min-w-0">
                                                <input 
                                                    type="url" 
                                                    value={formData.website || ''}
                                                    onFocus={() => {
                                                        isEditingRef.current = true;
                                                        userHasStartedTypingRef.current = true;
                                                        if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                                    }}
                                                    onChange={(e) => {
                                                        userHasStartedTypingRef.current = true;
                                                        isEditingRef.current = true;
                                                        hasUserEditedForm.current = true;
                                                        userEditedFieldsRef.current.add('website');
                                                        if (onEditingChange) onEditingChange(true);
                                                        if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                                        editingTimeoutRef.current = setTimeout(() => {
                                                            isEditingRef.current = false;
                                                            if (onEditingChange) onEditingChange(false);
                                                        }, 5000);
                                                        setFormData(prev => {
                                                            const updated = {...prev, website: e.target.value};
                                                            formDataRef.current = updated;
                                                            return updated;
                                                        });
                                                    }}
                                                    onBlur={async (e) => {
                                                        setTimeout(() => { isEditingRef.current = false; }, 500);
                                                        const url = ((e && e.target && e.target.value) || formDataRef.current?.website || formData.website || '').trim();
                                                        if (!url || !/^https?:\/\/[^\s/]+/i.test(url)) return;
                                                        try {
                                                            const logoRes = await fetch(`/api/website-logo?url=${encodeURIComponent(url)}`);
                                                            if (!logoRes.ok) return;
                                                            const { logoUrl } = await logoRes.json();
                                                            if (!logoUrl) return;
                                                            const updated = { ...formDataRef.current, thumbnail: logoUrl };
                                                            formDataRef.current = updated;
                                                            setFormData(prev => ({ ...prev, thumbnail: logoUrl }));
                                                            if (client?.id && typeof onSave === 'function') {
                                                                onSave(updated, true).catch(() => {});
                                                            }
                                                            if (onUpdate && client) onUpdate({ ...client, thumbnail: logoUrl });
                                                        } catch (_) {}
                                                    }}
                                                    placeholder="https://example.com"
                                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                                                />
                                            </div>
                                            {(formData.website || '').trim() && /^https?:\/\/[^\s/]+/i.test((formData.website || '').trim()) && (
                                                <div className="flex-shrink-0 flex items-center gap-1">
                                                    <div className="w-16 h-12 rounded border border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center" title="Site preview">
                                                        <img src={`/api/website-preview?url=${encodeURIComponent((formData.website || '').trim())}&width=320&height=240`} alt="" className="max-w-full max-h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                                                    </div>
                                                    {(formData.thumbnail || (client && client.thumbnail)) && (
                                                        <div className="w-10 h-10 rounded-full overflow-hidden border border-gray-200 bg-white flex items-center justify-center" title="Logo">
                                                            <img src={formData.thumbnail || client.thumbnail} alt="" className="w-full h-full object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Address</label>
                                    <textarea 
                                        value={formData.address}
                                        onFocus={() => {
                                            userHasStartedTypingRef.current = true;
                                            isEditingRef.current = true;
                                            if (onEditingChange) onEditingChange(true);
                                            if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                        }}
                                        onChange={(e) => {
                                            // CRITICAL: Mark that user has started typing and edited this field
                                            userHasStartedTypingRef.current = true;
                                            isEditingRef.current = true;
                                            hasUserEditedForm.current = true; // Mark that user has edited
                                            userEditedFieldsRef.current.add('address'); // Track that user has edited this field
                                            if (onEditingChange) onEditingChange(true);
                                            if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                            editingTimeoutRef.current = setTimeout(() => {
                                                isEditingRef.current = false;
                                                if (onEditingChange) onEditingChange(false);
                                            }, 5000); // Clear editing flag 5 seconds after user stops typing
                                            setFormData(prev => {
                                                const updated = {...prev, address: e.target.value};
                                                // CRITICAL: Sync formDataRef IMMEDIATELY so guards can check current value
                                                formDataRef.current = updated;
                                                return updated;
                                            });
                                        }}
                                        onBlur={() => {
                                            setTimeout(() => {
                                                isEditingRef.current = false;
                                            }, 500);
                                        }}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                                        rows="2"
                                        placeholder="Street address, City, Province, Postal Code"
                                    ></textarea>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">General Notes</label>
                                    <textarea 
                                        ref={notesTextareaRef}
                                        value={formData.notes}
                                        onFocus={() => {
                                            isEditingRef.current = true;
                                            userHasStartedTypingRef.current = true; // CRITICAL: Mark that user has started typing
                                            userEditedFieldsRef.current.add('notes'); // CRITICAL: Track that user has edited this field
                                            if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                        }}
                                        onChange={(e) => {
                                            // Skip if spacebar was just pressed (handled in onKeyDown)
                                            if (isSpacebarPressedRef.current) {
                                                isSpacebarPressedRef.current = false;
                                                return; // Skip - onKeyDown already updated formData
                                            }
                                            
                                            isEditingRef.current = true;
                                            userHasStartedTypingRef.current = true; // CRITICAL: Mark that user has started typing
                                            hasUserEditedForm.current = true;
                                            userEditedFieldsRef.current.add('notes');
                                            if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                            editingTimeoutRef.current = setTimeout(() => {
                                                isEditingRef.current = false;
                                            }, 5000);
                                            
                                            // Preserve cursor position
                                            const textarea = e.target;
                                            const cursorPos = textarea.selectionStart;
                                            const newValue = e.target.value;
                                            
                                            // Store cursor position for restoration after render
                                            notesCursorPositionRef.current = cursorPos;
                                            
                                            setFormData(prev => {
                                                const updated = {...prev, notes: newValue};
                                                formDataRef.current = updated;
                                                return updated;
                                            });
                                        }}
                                        onKeyDown={(e) => {
                                            // Handle spacebar specially to prevent cursor jumping
                                            if (e.key === ' ' || e.keyCode === 32) {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                
                                                const textarea = e.target;
                                                const start = textarea.selectionStart;
                                                const end = textarea.selectionEnd;
                                                const currentValue = formData.notes || '';
                                                const newValue = currentValue.substring(0, start) + ' ' + currentValue.substring(end);
                                                const newCursorPos = start + 1;
                                                
                                                // Mark that spacebar was pressed
                                                isSpacebarPressedRef.current = true;
                                                
                                                // Mark that user has started typing and edited this field
                                                userHasStartedTypingRef.current = true;
                                                hasUserEditedForm.current = true;
                                                userEditedFieldsRef.current.add('notes');
                                                
                                                // Store cursor position for restoration
                                                notesCursorPositionRef.current = newCursorPos;
                                                
                                                // Update React state - let React handle the value update normally
                                                setFormData(prev => {
                                                    const updated = {...prev, notes: newValue};
                                                    formDataRef.current = updated;
                                                    return updated;
                                                });
                                                
                                                // Restore cursor position after React re-renders
                                                // Use setTimeout to ensure it's after React's render cycle
                                                setTimeout(() => {
                                                    if (notesTextareaRef.current) {
                                                        notesTextareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
                                                        notesTextareaRef.current.focus();
                                                    }
                                                }, 0);
                                            }
                                        }}
                                        onBlur={(e) => {
                                            // Clear cursor position tracking when user leaves field
                                            notesCursorPositionRef.current = null;
                                            
                                            isEditingRef.current = false; // Clear editing flag when user leaves field
                                            // Auto-save notes when user leaves the field
                                            // Use the current textarea value to ensure we have the latest data
                                            if (client) {
                                                const latestNotes = e.target.value;
                                                
                                                // Mark form as edited to prevent useEffect from resetting
                                                hasUserEditedForm.current = true;
                                                isAutoSavingRef.current = true;
                                                
                                                // Get latest formData including the notes value from the textarea
                                                setFormData(prev => {
                                                    const latest = {...prev, notes: latestNotes};
                                                    // Update ref immediately
                                                    formDataRef.current = latest;
                                                    return latest;
                                                });
                                                
                                                // Update ref immediately with notes - use latest from textarea
                                                const latest = {...(formDataRef.current || {}), notes: latestNotes};
                                                formDataRef.current = latest;
                                                
                                                
                                                // Save the latest data after a small delay to ensure state is updated
                                                setTimeout(() => {
                                                    // CRITICAL: Set flag to prevent immediate overwriting after auto-save
                                                    justSavedRef.current = true;
                                                    saveTimestampRef.current = Date.now();
                                                    
                                                    onSave(latest, true).then((savedClient) => {
                                                        // Update formData with saved notes to ensure they persist
                                                        if (savedClient && savedClient.notes !== undefined) {
                                                            setFormData(prev => {
                                                                // CRITICAL: Always preserve current notes if they exist and are longer
                                                                // Only use savedClient notes if they're actually different and longer
                                                                const currentNotes = prev.notes || '';
                                                                const savedNotes = savedClient.notes || '';
                                                                if (currentNotes.trim().length > 0 && currentNotes.trim().length >= savedNotes.trim().length) {
                                                                    // Keep current notes if they're longer (user might have typed more)
                                                                    return {...prev, notes: currentNotes};
                                                                } else if (savedNotes.trim().length > 0) {
                                                                    // Use saved notes if they exist
                                                                    return {...prev, notes: savedNotes};
                                                                }
                                                                // Otherwise keep current
                                                                return prev;
                                                            });
                                                        }
                                                    }).catch((error) => {
                                                        console.error('❌ Error saving notes:', error);
                                                    }).finally(() => {
                                                        // Clear auto-saving flag after save completes AND a delay to prevent useEffect from running
                                                        // CRITICAL: This delay must be LONGER than the setSelectedClient delay in Clients.jsx (100ms)
                                                        setTimeout(() => {
                                                            isAutoSavingRef.current = false;
                                                            // Clear the justSaved flag after 3 seconds (enough time for parent to refresh and propagate)
                                                            setTimeout(() => {
                                                                justSavedRef.current = false;
                                                            }, 2000);
                                                        }, 1000); // Increased to 1000ms to ensure setSelectedClient delay (100ms) completes first
                                                    });
                                                }, 200); // Increased delay to ensure state is updated
                                            }
                                        }}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                                        rows="3"
                                        placeholder="General information about this client... Use @Name to mention a user."
                                    ></textarea>
                                </div>

                                {/* RSS News Feed Subscription */}
                                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <i className="fas fa-rss text-blue-600 dark:text-blue-400"></i>
                                                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                                                    News Feed Subscription
                                                </label>
                                            </div>
                                            <p className="text-xs text-gray-600 dark:text-gray-400">
                                                Receive daily news articles about this {client?.type === 'lead' ? 'lead' : 'client'} automatically
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                try {
                                                    const token = window.storage?.getToken?.();
                                                    const newSubscriptionStatus = !(formData.rssSubscribed !== false);
                                                    
                                                    const response = await fetch(`/api/clients/${formData.id}/rss-subscription`, {
                                                        method: 'POST',
                                                        headers: {
                                                            'Authorization': `Bearer ${token}`,
                                                            'Content-Type': 'application/json'
                                                        },
                                                        credentials: 'include',
                                                        body: JSON.stringify({ subscribed: newSubscriptionStatus })
                                                    });
                                                    
                                                    if (response.ok) {
                                                        setFormData({...formData, rssSubscribed: newSubscriptionStatus});
                                                        hasUserEditedForm.current = true;
                                                        alert(newSubscriptionStatus ? 'Subscribed to news feed' : 'Unsubscribed from news feed');
                                                    } else {
                                                        alert('Failed to update subscription. Please try again.');
                                                    }
                                                } catch (error) {
                                                    console.error('Error updating subscription:', error);
                                                    alert('Error updating subscription. Please try again.');
                                                }
                                            }}
                                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                                                formData.rssSubscribed !== false
                                                    ? 'bg-green-600 text-white hover:bg-green-700'
                                                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                                            }`}
                                        >
                                            <i className={`fas ${formData.rssSubscribed !== false ? 'fa-bell' : 'fa-bell-slash'}`}></i>
                                            {formData.rssSubscribed !== false ? 'Subscribed' : 'Not Subscribed'}
                                        </button>
                                    </div>
                                </div>

                                {/* Group Assignment */}
                                <div className="mt-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="block text-sm font-medium text-gray-700">Group Assignment</label>
                                        {client?.id && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowGroupSelector(true);
                                                    setSelectedGroupId('');
                                                }}
                                                className="px-3 py-1 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                                            >
                                                <i className="fas fa-plus mr-1"></i>
                                                Assign Group
                                            </button>
                                        )}
                                    </div>
                                    
                                    {!client?.id ? (
                                        <p className="text-xs text-gray-500">Save the client first to assign groups</p>
                                    ) : isLoadingGroups ? (
                                        <p className="text-xs text-gray-500">
                                            <i className="fas fa-spinner fa-spin mr-1"></i>
                                            Loading groups...
                                        </p>
                                    ) : clientGroupMemberships.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                            {clientGroupMemberships.map((membership) => (
                                                <div
                                                    key={membership.id || membership.group?.id}
                                                    className="px-3 py-1.5 text-xs rounded-full border bg-blue-50 text-blue-700 border-blue-200 flex items-center gap-2"
                                                >
                                                    <i className="fas fa-layer-group"></i>
                                                    <span>{membership.group?.name || 'Unknown Group'}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveFromGroup(membership.group?.id)}
                                                        className="ml-1 text-blue-500 hover:text-blue-700"
                                                        title="Remove from group"
                                                    >
                                                        <i className="fas fa-times"></i>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-gray-500">No groups assigned</p>
                                    )}
                                    
                                    {/* Group Selector Modal */}
                                    {showGroupSelector && (
                                        <div 
                                            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]" 
                                            onClick={() => {
                                                setShowGroupSelector(false);
                                                setSelectedGroupId('');
                                            }}
                                            style={{ zIndex: 9999 }}
                                        >
                                            <div 
                                                className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl"
                                                onClick={(e) => e.stopPropagation()}
                                                style={{ zIndex: 10000 }}
                                            >
                                                <div className="flex justify-between items-center mb-4">
                                                    <h3 className="text-lg font-semibold text-gray-900">
                                                        Assign to Group
                                                    </h3>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setShowGroupSelector(false);
                                                            setSelectedGroupId('');
                                                        }}
                                                        className="text-gray-500 hover:text-gray-700 transition-colors"
                                                    >
                                                        <i className="fas fa-times text-xl"></i>
                                                    </button>
                                                </div>
                                                
                                                <div className="space-y-4">
                                                    <div>
                                                        <label className="block text-sm font-medium mb-2 text-gray-700">
                                                            Select Group
                                                        </label>
                                                        {availableGroups.length === 0 ? (
                                                            <p className="text-sm text-gray-500">
                                                                No groups available. Create a group from the Groups tab first.
                                                            </p>
                                                        ) : (
                                                            <select
                                                                value={selectedGroupId}
                                                                onChange={(e) => setSelectedGroupId(e.target.value)}
                                                                className="w-full px-3 py-2 rounded-md border bg-white border-gray-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                            >
                                                                <option value="">Select a group...</option>
                                                                {availableGroups
                                                                    .filter(g => !clientGroupMemberships.some(m => m.group?.id === g.id))
                                                                    .map((group) => (
                                                                        <option key={group.id} value={group.id}>
                                                                            {group.name} {group.industry ? `(${group.industry})` : ''}
                                                                        </option>
                                                                    ))}
                                                            </select>
                                                        )}
                                                    </div>
                                                    
                                                    <div className="flex gap-3 justify-end">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setShowGroupSelector(false);
                                                                setSelectedGroupId('');
                                                            }}
                                                            className="px-4 py-2 rounded-md transition-colors bg-gray-200 hover:bg-gray-300 text-gray-900"
                                                        >
                                                            Cancel
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={handleAddToGroup}
                                                            disabled={!selectedGroupId}
                                                            className={`px-4 py-2 rounded-md transition-colors ${
                                                                !selectedGroupId
                                                                    ? 'bg-gray-400 cursor-not-allowed text-gray-200'
                                                                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                                                            }`}
                                                        >
                                                            Assign
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Services - service level tags - Hidden for leads */}
                                {!isLead && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Services</label>
                                    <div className="flex flex-wrap gap-2">
                                        {[
                                            'Self-Managed FMS',
                                            'Comprehensive FMS',
                                            'Diesel Refund Compliance',
                                            'Diesel Refund Audit',
                                            'Weight Track'
                                        ].map(option => {
                                            const isSelected = Array.isArray(formData.services) && formData.services.includes(option);
                                            return (
                                                <button
                                                    key={option}
                                                    type="button"
                                                    onClick={() => {
                                                        const current = Array.isArray(formData.services) ? formData.services : [];
                                                        const next = isSelected
                                                            ? current.filter(s => s !== option)
                                                            : [...current, option];
                                                        const updatedFormData = { ...formData, services: next };
                                                        setFormData(updatedFormData);
                                                        formDataRef.current = updatedFormData; // CRITICAL: Update ref immediately for auto-save
                                                        hasUserEditedForm.current = true;
                                                        userEditedFieldsRef.current.add('services'); // Track that user has edited services
                                                        
                                                        // Auto-save services immediately (stay in edit mode)
                                                        if (client && onSave) {
                                                            isAutoSavingRef.current = true;
                                                            onSave(updatedFormData, true).finally(() => {
                                                                isAutoSavingRef.current = false;
                                                            });
                                                        }
                                                    }}
                                                    className={`px-3 py-1.5 text-xs rounded-full border transition ${
                                                        isSelected
                                                            ? 'bg-primary-100 text-primary-700 border-primary-200'
                                                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    <i className="fas fa-tags mr-1"></i>
                                                    {option}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                )}

                                {/* Delete {entityLabel} Section */}
                                {client && onDelete && (
                                    <div className="pt-6 mt-6 border-t border-gray-200 dark:border-gray-700">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                                                    Danger Zone
                                                </h3>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                    Once you delete a {entityLabelLower}, there is no going back. Please be certain.
                                                </p>
                                            </div>
                                            <button 
                                                type="button" 
                                                onClick={() => {
                                                    if (confirm(`Are you sure you want to delete this ${entityLabelLower}? This action cannot be undone.`)) {
                                                        // onDelete will handle closing the modal after optimistic update
                                                        // Don't call onClose here - let handleDeleteClient close it to avoid reload
                                                        onDelete(client.id);
                                                    }
                                                }}
                                                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center gap-2"
                                            >
                                                <i className="fas fa-trash"></i>
                                                Delete {entityLabel}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Contacts Tab */}
                        {activeTab === 'contacts' && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-lg font-semibold text-gray-900">Contact Persons</h3>
                                    <div className="flex items-center gap-3">
                                        {!showContactForm && (
                                            <button
                                                type="button"
                                                onClick={() => setShowContactForm(true)}
                                                className="bg-primary-600 text-white px-3 py-1.5 text-sm rounded-lg hover:bg-primary-700 flex items-center"
                                            >
                                                <i className="fas fa-plus mr-1.5"></i>
                                                Add Contact
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {showContactForm && (
                                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                        <h4 className="font-medium text-gray-900 mb-3 text-sm">
                                            {editingContact ? 'Edit Contact' : 'New Contact'}
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
                                                <input
                                                    type="text"
                                                    value={newContact.name}
                                                    onChange={(e) => setNewContact({...newContact, name: e.target.value})}
                                                    onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                                                    placeholder="Contact name"
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
                                                <input
                                                    type="text"
                                                    value={newContact.role}
                                                    onChange={(e) => setNewContact({...newContact, role: e.target.value})}
                                                    onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                                                    placeholder="e.g., Manager, Director"
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Department</label>
                                                <input
                                                    type="text"
                                                    value={newContact.department}
                                                    onChange={(e) => setNewContact({...newContact, department: e.target.value})}
                                                    onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                                                    placeholder="e.g., Operations, Finance"
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                                                <input
                                                    type="email"
                                                    value={newContact.email}
                                                    onChange={(e) => setNewContact({...newContact, email: e.target.value})}
                                                    onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                                                    placeholder="contact@company.com"
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
                                                <input
                                                    type="tel"
                                                    value={newContact.phone}
                                                    onChange={(e) => setNewContact({...newContact, phone: e.target.value})}
                                                    onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                                                    placeholder="+27 11 123 4567"
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Town</label>
                                                <input
                                                    type="text"
                                                    value={newContact.town}
                                                    onChange={(e) => setNewContact({...newContact, town: e.target.value})}
                                                    onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                                                    placeholder="e.g., Johannesburg, Cape Town"
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Linked Sites</label>
                                                {(formData.sites || []).length === 0 ? (
                                                    <p className="text-xs text-gray-500">Add sites on the Sites tab to link this contact.</p>
                                                ) : (
                                                    <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto p-2 border border-gray-200 rounded-lg bg-gray-50">
                                                        {(formData.sites || []).map(site => {
                                                            const checked = getContactSiteIds(newContact).includes(String(site.id));
                                                            return (
                                                                <label key={site.id} className="flex items-center gap-1.5 text-xs cursor-pointer">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={checked}
                                                                        onChange={(e) => {
                                                                            const siteIds = getContactSiteIds(newContact);
                                                                            const next = e.target.checked
                                                                                ? [...siteIds, String(site.id)]
                                                                                : siteIds.filter((id) => id !== String(site.id));
                                                                            setNewContact({ ...newContact, siteIds: next, siteId: next[0] || null });
                                                                        }}
                                                                    />
                                                                    <span>{site.name}</span>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center">
                                                <label className="flex items-center cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={newContact.isPrimary}
                                                        onChange={(e) => setNewContact({...newContact, isPrimary: e.target.checked})}
                                                        className="mr-2"
                                                    />
                                                    <span className="text-xs font-medium text-gray-700">Primary Contact</span>
                                                </label>
                                            </div>
                                        </div>
                                        <div className="flex justify-end gap-2 mt-3">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowContactForm(false);
                                                    setEditingContact(null);
                                                    setNewContact({
                                                        name: '',
                                                        role: '',
                                                        department: '',
                                                        email: '',
                                                        phone: '',
                                                        isPrimary: false
                                                    });
                                                }}
                                                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="button"
                                                onClick={editingContact ? handleUpdateContact : handleAddContact}
                                                className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                                            >
                                                {editingContact ? 'Update' : 'Add'} Contact
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    {(() => {
                                        // CRITICAL: Merge formData contacts with optimistic contacts and deduplicate
                                        const formContacts = formData.contacts || [];
                                        const optimistic = optimisticContacts || [];
                                        
                                        // Use mergeUniqueById for consistent deduplication
                                        const allContacts = mergeUniqueById(formContacts, optimistic);

                                        return allContacts.length === 0 ? (
                                            <div className="text-center py-8 text-gray-500 text-sm">
                                                <i className="fas fa-users text-3xl mb-2"></i>
                                                <p>No contacts added yet</p>
                                            </div>
                                        ) : (
                                            allContacts.map(contact => (
                                            <div 
                                                key={contact.id} 
                                                className={`${isDark ? 'bg-gray-700 border-gray-600 hover:border-primary-400' : 'bg-white border-gray-200 hover:border-primary-300'} rounded-lg p-3 transition cursor-pointer hover:shadow-md`}
                                                onClick={() => handleEditContact(contact)}
                                            >
                                                <div className="flex justify-between items-start">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <h4 className={`font-semibold text-sm ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{contact.name}</h4>
                                                            {contact.isPrimary && (
                                                                <span className={`px-2 py-0.5 text-xs rounded font-medium ${isDark ? 'bg-primary-900 text-primary-200' : 'bg-primary-100 text-primary-700'}`}>
                                                                    Primary
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className={`grid grid-cols-2 gap-x-4 gap-y-1 text-xs ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                                                            {contact.role && (
                                                                <div><i className="fas fa-briefcase mr-1.5 w-4"></i>{contact.role}</div>
                                                            )}
                                                            {contact.department && (
                                                                <div><i className="fas fa-building mr-1.5 w-4"></i>{contact.department}</div>
                                                            )}
                                                            <div><i className="fas fa-envelope mr-1.5 w-4"></i>
                                                                <a href={`mailto:${contact.email}`} className="text-primary-600 hover:underline">
                                                                    {contact.email}
                                                                </a>
                                                            </div>
                                                            {contact.phone && (
                                                                <div><i className="fas fa-phone mr-1.5 w-4"></i>{contact.phone}</div>
                                                            )}
                                                            {contact.town && (
                                                                <div><i className="fas fa-map-marker-alt mr-1.5 w-4"></i>{contact.town}</div>
                                                            )}
                                                            {getContactSiteIds(contact).length > 0 && (() => {
                                                                const linkedNames = getContactSiteIds(contact)
                                                                    .map((sid) => (formData.sites || []).find(s => String(s.id) === String(sid))?.name)
                                                                    .filter(Boolean);
                                                                return linkedNames.length > 0 ? (
                                                                    <div className="col-span-2">
                                                                        <i className="fas fa-map-marker-alt mr-1.5 w-4 text-primary-600"></i>
                                                                        <span className="text-primary-600 font-medium">Linked to: </span>
                                                                        <span className="text-gray-600">{linkedNames.join(', ')}</span>
                                                                    </div>
                                                                ) : null;
                                                            })()}
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleEditContact(contact)}
                                                            className="text-primary-600 hover:text-primary-700 p-1"
                                                            title="Edit"
                                                        >
                                                            <i className="fas fa-edit"></i>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteContact(contact.id)}
                                                            className="text-red-600 hover:text-red-700 p-1"
                                                            title="Delete"
                                                        >
                                                            <i className="fas fa-trash"></i>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    );
                                    })()}
                                </div>
                            </div>
                        )}

                        {/* Sites Tab */}
                        {activeTab === 'sites' && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Sites & Locations</h3>
                                    {!showSiteForm && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditingSite(null);
                                                setNewSite({
                                                    name: '',
                                                    address: '',
                                                    contactPerson: '',
                                                    phone: '',
                                                    email: '',
                                                    notes: '',
                                                    latitude: '',
                                                    longitude: '',
                                                    gpsCoordinates: '',
                                                    siteLead: '',
                                                    siteType: isLead ? 'lead' : 'client',
                                                    engagementStage: 'Potential',
                                                    aidaStatus: 'Awareness'
                                                });
                                                setShowSiteForm(true);
                                            }}
                                            className="bg-primary-600 text-white px-3 py-1.5 text-sm rounded-lg hover:bg-primary-700 flex items-center"
                                        >
                                            <i className="fas fa-plus mr-1.5"></i>
                                            Add Site
                                        </button>
                                    )}
                                </div>

                                {showSiteForm && (
                                    <div className={`rounded-lg p-4 border ${isDark ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                                        <div className="flex items-center justify-between mb-3">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowSiteForm(false);
                                                    setEditingSite(null);
                                                    setNewSite({ name: '', address: '', contactPerson: '', phone: '', email: '', notes: '', latitude: '', longitude: '', gpsCoordinates: '', siteLead: '', siteType: isLead ? 'lead' : 'client', engagementStage: 'Potential', aidaStatus: 'Awareness' });
                                                    if (typeof onInitialSiteOpened === 'function') onInitialSiteOpened();
                                                }}
                                                className={`text-sm flex items-center gap-1.5 ${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900'}`}
                                            >
                                                <i className="fas fa-arrow-left"></i>
                                                Back to list
                                            </button>
                                            <h4 className={`font-medium text-sm ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                {editingSite ? 'Edit Site' : 'New Site'}
                                            </h4>
                                            <span className="w-20" aria-hidden="true" />
                                        </div>
                                        {/* Section styling: label and input classes for dark/light */}
                                        {(() => {
                                            const labelCls = `block text-xs font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`;
                                            const inputCls = `w-full px-3 py-1.5 text-sm border rounded-lg ${isDark ? 'bg-gray-600 border-gray-500 text-gray-100 placeholder-gray-400' : 'border-gray-300'}`;
                                            const hintCls = `text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`;
                                            const disabledSelectCls = isDark ? 'bg-gray-700 text-gray-400 border-gray-600 cursor-not-allowed opacity-70' : 'bg-gray-100 text-gray-500 border-gray-300 cursor-not-allowed opacity-80';
                                            const sectionHeadingCls = `text-sm font-semibold mb-2 ${isDark ? 'text-gray-200' : 'text-gray-800'}`;
                                            const sectionWrapCls = `rounded-lg p-3 mb-4 ${isDark ? 'bg-gray-600/50 border border-gray-600' : 'bg-white/60 border border-gray-200'}`;
                                            const isClientSite = (newSite.siteType || 'lead') === 'client';
                                            return (
                                        <div className="space-y-1">
                                            {/* General */}
                                            <div className={sectionWrapCls}>
                                                <h5 className={sectionHeadingCls}>General</h5>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <div>
                                                        <label className={labelCls}>Site Name *</label>
                                                        <input type="text" value={newSite.name} onChange={(e) => setNewSite({...newSite, name: e.target.value})} onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} className={inputCls} placeholder="e.g., Main Mine, North Farm" />
                                                    </div>
                                                    <div>
                                                        <label className={labelCls}>Site type</label>
                                                        <select value={newSite.siteType === 'client' ? 'client' : 'lead'} onChange={(e) => setNewSite({...newSite, siteType: e.target.value})} className={inputCls} title="Lead = show in Pipeline; Client = do not show in Pipeline">
                                                            <option value="lead">Lead (show in Pipeline)</option>
                                                            <option value="client">Client (do not show in Pipeline)</option>
                                                        </select>
                                                        <p className={hintCls}>Lead sites appear in the Pipeline until marked as Client.</p>
                                                    </div>
                                                    {!isLead && (
                                                        <>
                                                            <div>
                                                                <label className={`${labelCls} ${isClientSite ? 'opacity-60' : ''}`}>AIDA Status</label>
                                                                <select value={['No Engagement','Awareness','Interest','Desire','Action'].find(s => s.toLowerCase() === (newSite.aidaStatus ?? 'awareness').toLowerCase()) || 'Awareness'} onChange={(e) => setNewSite({...newSite, aidaStatus: e.target.value})} className={`${inputCls} ${isClientSite ? disabledSelectCls : ''}`} title="AIDA stage – matches list AIDA Status column" disabled={isClientSite}>
                                                                    <option value="No Engagement">No Engagement</option>
                                                                    <option value="Awareness">Awareness</option>
                                                                    <option value="Interest">Interest</option>
                                                                    <option value="Desire">Desire</option>
                                                                    <option value="Action">Action</option>
                                                                </select>
                                                                <p className={hintCls}>{isClientSite ? 'Disabled for Client sites.' : 'AIDA stage – syncs with list.'}</p>
                                                            </div>
                                                            <div>
                                                                <label className={`${labelCls} ${isClientSite ? 'opacity-60' : ''}`}>Engagement Stage</label>
                                                                <select value={['Disinterested','Potential','Active','Proposal','Tender'].find(s => s.toLowerCase() === (newSite.engagementStage ?? newSite.stage ?? 'potential').toLowerCase()) || 'Potential'} onChange={(e) => setNewSite({...newSite, engagementStage: e.target.value, stage: e.target.value})} className={`${inputCls} ${isClientSite ? disabledSelectCls : ''}`} title="Lifecycle status – matches list Engagement Stage column" disabled={isClientSite}>
                                                                    <option value="Disinterested">Disinterested</option>
                                                                    <option value="Potential">Potential</option>
                                                                    <option value="Active">Active</option>
                                                                    <option value="Proposal">Proposal</option>
                                                                    <option value="Tender">Tender</option>
                                                                </select>
                                                                <p className={hintCls}>{isClientSite ? 'Disabled for Client sites.' : 'Lifecycle status – syncs with list.'}</p>
                                                            </div>
                                                        </>
                                                    )}
                                                    <div>
                                                        <label className={labelCls}>Site Contact</label>
                                                        <input type="text" value={newSite.contactPerson} onChange={(e) => setNewSite({...newSite, contactPerson: e.target.value})} onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} placeholder="Contact person name" className={inputCls} />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Location */}
                                            <div className={sectionWrapCls}>
                                                <h5 className={sectionHeadingCls}>Location</h5>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <div className="md:col-span-2">
                                                        <label className={labelCls}>Address</label>
                                                        <textarea value={newSite.address} onChange={(e) => setNewSite({...newSite, address: e.target.value})} className={inputCls} rows="2" placeholder="Full site address"></textarea>
                                                    </div>
                                                    <div className="md:col-span-2">
                                                        <label className={labelCls}>GPS Coordinates</label>
                                                        <div className="flex gap-2">
                                                            <input type="text" value={newSite.gpsCoordinates} onChange={(e) => { const coords = parseGPSCoordinates(e.target.value); setNewSite({...newSite, gpsCoordinates: e.target.value, latitude: coords.latitude, longitude: coords.longitude}); }} className={`flex-1 ${inputCls}`} placeholder="e.g., -26.2041, 28.0473 or -26.2041, 28.0473" />
                                                            <button type="button" onClick={getCurrentLocation} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors" title="Get current location"><i className="fas fa-location-arrow"></i></button>
                                                            <button type="button" onClick={() => { if (newSite.latitude && newSite.longitude) { window.open(`https://www.openstreetmap.org/?mlat=${newSite.latitude}&mlon=${newSite.longitude}&zoom=15`, '_blank'); } else { alert('Please enter GPS coordinates first'); } }} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors" title="Open in OpenStreetMap"><i className="fas fa-map"></i></button>
                                                        </div>
                                                        <div className="flex gap-2 mt-2">
                                                            <input type="number" step="any" value={newSite.latitude} onChange={(e) => setNewSite({...newSite, latitude: e.target.value, gpsCoordinates: e.target.value && newSite.longitude ? `${e.target.value}, ${newSite.longitude}` : ''})} className={`flex-1 ${inputCls}`} placeholder="Latitude (-90 to 90)" />
                                                            <input type="number" step="any" value={newSite.longitude} onChange={(e) => setNewSite({...newSite, longitude: e.target.value, gpsCoordinates: newSite.latitude && e.target.value ? `${newSite.latitude}, ${e.target.value}` : ''})} className={`flex-1 ${inputCls}`} placeholder="Longitude (-180 to 180)" />
                                                        </div>
                                                    </div>
                                                    <div className="md:col-span-2">
                                                        <label className={labelCls}>Location Map</label>
                                                        <window.MapComponent latitude={newSite.latitude} longitude={newSite.longitude} siteName={newSite.name || 'Site Location'} allowSelection={true} onLocationSelect={handleSiteMapLocationSelect} />
                                                        <div className={`mt-2 text-xs ${hintCls}`}>💡 <strong>Tip:</strong> Click anywhere on the map to drop a pin and automatically fill in the GPS fields, or use the buttons above to pull your current location or open OpenStreetMap.</div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Communication */}
                                            <div className={sectionWrapCls}>
                                                <h5 className={sectionHeadingCls}>Communication</h5>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <div>
                                                        <label className={labelCls}>Phone</label>
                                                        <input type="tel" value={newSite.phone} onChange={(e) => setNewSite({...newSite, phone: e.target.value})} onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} placeholder="+27 11 123 4567" className={inputCls} />
                                                    </div>
                                                    <div>
                                                        <label className={labelCls}>Email</label>
                                                        <input type="email" value={newSite.email} onChange={(e) => setNewSite({...newSite, email: e.target.value})} onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} placeholder="site@company.com" className={inputCls} />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Status & stage (lead only) */}
                                            {isLead && (
                                                <div className={sectionWrapCls}>
                                                    <h5 className={sectionHeadingCls}>Status & stage</h5>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        <div>
                                                            <label className={labelCls}>AIDA Status</label>
                                                            <select value={['No Engagement','Awareness','Interest','Desire','Action'].find(s => s.toLowerCase() === (newSite.aidaStatus ?? 'awareness').toLowerCase()) || 'Awareness'} onChange={(e) => setNewSite({...newSite, aidaStatus: e.target.value})} className={inputCls}>
                                                                <option value="No Engagement">No Engagement</option>
                                                                <option value="Awareness">Awareness</option>
                                                                <option value="Interest">Interest</option>
                                                                <option value="Desire">Desire</option>
                                                                <option value="Action">Action</option>
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className={labelCls}>Engagement Stage</label>
                                                            <select value={['Disinterested','Potential','Active','Proposal','Tender'].find(s => s.toLowerCase() === (newSite.engagementStage ?? newSite.stage ?? 'potential').toLowerCase()) || 'Potential'} onChange={(e) => setNewSite({...newSite, engagementStage: e.target.value, stage: e.target.value})} className={inputCls}>
                                                                <option value="Disinterested">Disinterested</option>
                                                                <option value="Potential">Potential</option>
                                                                <option value="Active">Active</option>
                                                                <option value="Proposal">Proposal</option>
                                                                <option value="Tender">Tender</option>
                                                            </select>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Notes */}
                                            <div className={sectionWrapCls}>
                                                <h5 className={sectionHeadingCls}>Notes</h5>
                                                <textarea value={newSite.notes} onChange={(e) => setNewSite({...newSite, notes: e.target.value})} className={inputCls} rows="2" placeholder="Equipment deployed, special instructions, etc."></textarea>
                                            </div>

                                            {/* Linked contacts (only when editing an existing site) */}
                                            {editingSite?.id && (
                                                <div className={sectionWrapCls}>
                                                    <h5 className={sectionHeadingCls}>Linked contacts</h5>
                                                    {(() => {
                                                        const allContactsForSite = mergeContactRecords(formData.contacts || [], optimisticContacts || []);
                                                        const linkedToThisSite = allContactsForSite.filter(c => contactIsLinkedToSite(c, editingSite.id));
                                                        const availableToLink = allContactsForSite.filter(c => !contactIsLinkedToSite(c, editingSite.id));
                                                        return (
                                                            <div className="space-y-3">
                                                                {linkedToThisSite.length > 0 ? (
                                                                    <ul className={`divide-y ${isDark ? 'divide-gray-600' : 'divide-gray-200'}`}>
                                                                        {linkedToThisSite.map(c => (
                                                                            <li key={c.id} className={`py-2 flex items-center justify-between gap-2 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                                                                                <div className="min-w-0">
                                                                                    <span className="font-medium">{c.name}</span>
                                                                                    {(c.role || c.phone || c.email) && (
                                                                                        <div className={`text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                                                            {[c.role, c.phone, c.email].filter(Boolean).join(' · ')}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                                <button type="button" onClick={() => handleUnlinkContactFromSite(c.id)} className={`shrink-0 px-2 py-1 text-xs rounded ${isDark ? 'text-red-300 hover:bg-gray-600' : 'text-red-600 hover:bg-red-50'}`} title="Unlink from this site">Unlink</button>
                                                                            </li>
                                                                        ))}
                                                                    </ul>
                                                                ) : (
                                                                    <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>No contacts linked to this site yet.</p>
                                                                )}
                                                                {availableToLink.length > 0 && (
                                                                    <div className="flex flex-wrap items-center gap-2">
                                                                        <label className={labelCls + ' mb-0'} style={{ marginRight: 4 }}>Link contact:</label>
                                                                        <select
                                                                            className={`${inputCls} max-w-xs`}
                                                                            value=""
                                                                            onChange={(e) => {
                                                                                const id = e.target.value;
                                                                                if (id) { handleLinkContactToSite(id); e.target.value = ''; }
                                                                            }}
                                                                        >
                                                                            <option value="">Choose a contact…</option>
                                                                            {availableToLink.map(c => (
                                                                                <option key={c.id} value={c.id}>{c.name}{c.role ? ` (${c.role})` : ''}</option>
                                                                            ))}
                                                                        </select>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            )}
                                        </div>
                                            );
                                        })()}
                                        <div className="flex justify-end gap-2 mt-3">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowSiteForm(false);
                                                    setEditingSite(null);
                                                    setNewSite({
                                                        name: '',
                                                        address: '',
                                                        contactPerson: '',
                                                        phone: '',
                                                        email: '',
                                                        notes: '',
                                                        latitude: '',
                                                        longitude: '',
                                                        gpsCoordinates: '',
                                                        siteLead: '',
                                                        siteType: isLead ? 'lead' : 'client',
                                                        engagementStage: 'Potential',
                                                        aidaStatus: 'Awareness'
                                                    });
                                                    if (typeof onInitialSiteOpened === 'function') onInitialSiteOpened();
                                                }}
                                                className={`px-3 py-1.5 text-sm border rounded-lg ${isDark ? 'border-gray-500 hover:bg-gray-600 text-gray-200' : 'border-gray-300 hover:bg-gray-50'}`}
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="button"
                                                onClick={editingSite ? handleUpdateSite : handleAddSite}
                                                className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                                            >
                                                {editingSite ? 'Update' : 'Add'} Site
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {!showSiteForm && (
                                <div className={`overflow-x-auto rounded-lg border ${isDark ? 'border-gray-600' : 'border-gray-200'}`}>
                                    {(() => {
                                        const formSites = formData.sites || [];
                                        const optimistic = optimisticSites || [];
                                        const siteMap = new Map();
                                        formSites.forEach(site => { if (site?.id) siteMap.set(site.id, site); });
                                        optimistic.forEach(site => { if (site?.id) siteMap.set(site.id, site); });
                                        const allSites = Array.from(siteMap.values());
                                        if (allSites.length === 0) {
                                            return (
                                                <div className={`text-center py-8 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                    <i className="fas fa-map-marker-alt text-3xl mb-2"></i>
                                                    <p>No sites added yet</p>
                                                </div>
                                            );
                                        }
                                        const allContactsForTable = mergeContactRecords(formData.contacts || [], optimisticContacts || []);
                                        const getSiteContactDisplay = (site) => {
                                            const linked = allContactsForTable.filter(c => contactIsLinkedToSite(c, site.id));
                                            if (linked.length > 0) return linked.map(c => c.name).join(', ');
                                            if (site.contactPerson && String(site.contactPerson).trim()) return site.contactPerson;
                                            return '—';
                                        };
                                        return (
                                            <table className="min-w-full divide-y divide-gray-200">
                                                <thead className={isDark ? 'bg-gray-700' : 'bg-gray-50'}>
                                                    <tr>
                                                        <th scope="col" className={`px-4 py-2.5 text-left text-xs font-medium uppercase ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>Name</th>
                                                        <th scope="col" className={`px-4 py-2.5 text-left text-xs font-medium uppercase ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>Address</th>
                                                        <th scope="col" className={`px-4 py-2.5 text-left text-xs font-medium uppercase ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>Contact</th>
                                                        <th scope="col" className={`px-4 py-2.5 text-left text-xs font-medium uppercase ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>AIDA Status</th>
                                                        <th scope="col" className={`px-4 py-2.5 text-left text-xs font-medium uppercase ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>Engagement Stage</th>
                                                        <th scope="col" className={`px-4 py-2.5 text-right text-xs font-medium uppercase ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody className={`divide-y ${isDark ? 'divide-gray-600' : 'divide-gray-200'}`}>
                                                    {allSites.map(site => (
                                                        <tr
                                                            key={site.id}
                                                            onClick={() => handleEditSite(site)}
                                                            className={`cursor-pointer transition-colors ${isDark ? 'hover:bg-gray-600/50' : 'hover:bg-primary-50/50'}`}
                                                        >
                                                            <td className={`px-4 py-3 text-sm font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{site.name || '—'}</td>
                                                            <td className={`px-4 py-3 text-sm max-w-xs truncate ${isDark ? 'text-gray-300' : 'text-gray-600'}`} title={site.address}>{site.address || '—'}</td>
                                                            <td className={`px-4 py-3 text-sm max-w-[10rem] truncate ${isDark ? 'text-gray-300' : 'text-gray-600'}`} title={getSiteContactDisplay(site)}>{getSiteContactDisplay(site)}</td>
                                                            <td className="px-4 py-3">
                                                                {site.aidaStatus ? (
                                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                                                        site.aidaStatus === 'No Engagement' ? 'bg-white text-gray-800 border border-gray-200' :
                                                                        site.aidaStatus === 'Awareness' ? 'bg-pink-100 text-pink-800' :
                                                                        site.aidaStatus === 'Interest' ? 'bg-yellow-100 text-yellow-800' :
                                                                        site.aidaStatus === 'Desire' ? 'bg-blue-100 text-blue-800' :
                                                                        site.aidaStatus === 'Action' ? 'bg-green-100 text-green-800' :
                                                                        'bg-white text-gray-800 border border-gray-200'
                                                                    }`}>{site.aidaStatus}</span>
                                                                ) : (
                                                                    <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>—</span>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                {(() => {
                                                                    const engagementStage = site.engagementStage ?? site.stage;
                                                                    if (!engagementStage) return <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>—</span>;
                                                                    const stageLower = String(engagementStage).toLowerCase();
                                                                    return (
                                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                                                            stageLower === 'disinterested' ? (isDark ? 'bg-primary-900/80 text-primary-200' : 'bg-primary-100 text-primary-800') :
                                                                            stageLower === 'potential' ? (isDark ? 'bg-gray-700 text-gray-200 border border-gray-600' : 'bg-white text-gray-800 border border-gray-200') :
                                                                            stageLower === 'active' || stageLower === 'proposal' || stageLower === 'tender' ? (isDark ? 'bg-green-900 text-green-200' : 'bg-green-100 text-green-800') :
                                                                            (isDark ? 'bg-gray-700 text-gray-200 border border-gray-600' : 'bg-white text-gray-800 border border-gray-200')
                                                                        }`}>{engagementStage}</span>
                                                                    );
                                                                })()}
                                                            </td>
                                                            <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                                                                <div className="flex justify-end gap-1">
                                                                    <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleEditSite(site); }} className="text-primary-600 hover:text-primary-700 p-2 hover:bg-primary-50 rounded-lg transition-colors" title="Edit Site"><i className="fas fa-edit"></i></button>
                                                                    <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleDeleteSite(site.id); }} className="text-red-600 hover:text-red-700 p-2 hover:bg-red-50 rounded-lg transition-colors shrink-0" title="Delete Site"><i className="fas fa-trash"></i></button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        );
                                    })()}
                                </div>
                                )}
                            </div>
                        )}

                        {/* Opportunities Tab */}
                        {activeTab === 'opportunities' && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-900">Opportunities</h3>
                                        <p className="text-sm text-gray-600 mt-0.5">Track upsell, cross-sell, and expansion opportunities</p>
                                    </div>
                                    {!showOpportunityForm && (
                                        <button
                                            type="button"
                                            onClick={() => setShowOpportunityForm(true)}
                                            className="bg-green-600 text-white px-3 py-1.5 text-sm rounded-lg hover:bg-green-700 flex items-center"
                                        >
                                            <i className="fas fa-plus mr-1.5"></i>
                                            Add Opportunity
                                        </button>
                                    )}
                                </div>

                                {showOpportunityForm && (
                                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                        <h4 className="font-medium text-gray-900 mb-3 text-sm">
                                            {editingOpportunity ? 'Edit Opportunity' : 'New Opportunity'}
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div className="col-span-2">
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Opportunity Name *</label>
                                                <input
                                                    type="text"
                                                    value={newOpportunity.name}
                                                    onChange={(e) => setNewOpportunity({...newOpportunity, name: e.target.value})}
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                    placeholder="e.g., North Mine Expansion, Premium Upgrade"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">AIDA Status</label>
                                                <select
                                                    value={newOpportunity.aidaStatus ?? newOpportunity.stage}
                                                    onChange={(e) => setNewOpportunity({...newOpportunity, aidaStatus: e.target.value})}
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                >
                                                    <option>Awareness</option>
                                                    <option>Interest</option>
                                                    <option>Desire</option>
                                                    <option>Action</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Expected Close Date</label>
                                                <input
                                                    type="date"
                                                    value={newOpportunity.expectedCloseDate}
                                                    onChange={(e) => setNewOpportunity({...newOpportunity, expectedCloseDate: e.target.value})}
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Related Site (Optional)</label>
                                                <select
                                                    value={newOpportunity.relatedSiteId || ''}
                                                    onChange={(e) => setNewOpportunity({...newOpportunity, relatedSiteId: e.target.value || null})}
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                >
                                                    <option value="">None</option>
                                                    {formData.sites?.map(site => (
                                                        <option key={site.id} value={site.id}>{site.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="col-span-2">
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                                                <textarea
                                                    value={newOpportunity.notes}
                                                    onChange={(e) => setNewOpportunity({...newOpportunity, notes: e.target.value})}
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                    rows="2"
                                                    placeholder="Additional details about this opportunity..."
                                                ></textarea>
                                            </div>
                                        </div>
                                        <div className="flex justify-end gap-2 mt-3">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowOpportunityForm(false);
                                                    setEditingOpportunity(null);
                                                    setNewOpportunity({
                                                        name: '',
                                                        aidaStatus: 'Awareness',
                    engagementStage: 'Potential',
                                                        expectedCloseDate: '',
                                                        relatedSiteId: null,
                                                        notes: ''
                                                    });
                                                }}
                                                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="button"
                                                onClick={editingOpportunity ? handleUpdateOpportunity : handleAddOpportunity}
                                                className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                                            >
                                                {editingOpportunity ? 'Update' : 'Add'} Opportunity
                                            </button>
                                        </div>
                                    </div>
                                )}


                                <div className="space-y-2">
                                    {(!formData.opportunities || formData.opportunities.length === 0) ? (
                                        <div className="text-center py-8 text-gray-500 text-sm">
                                            <i className="fas fa-bullseye text-3xl mb-2"></i>
                                            <p>No opportunities added yet</p>
                                            <p className="text-xs mt-1">Track expansion, upsell, and cross-sell opportunities</p>
                                        </div>
                                    ) : (
                                        formData.opportunities.map(opportunity => {
                                            const relatedSite = formData.sites?.find(s => s.id === opportunity.relatedSiteId);
                                            const aidaStatus = opportunity.aidaStatus ?? opportunity.stage;
                                            const stageColor = 
                                                aidaStatus === 'No Engagement' ? 'bg-white text-gray-700 border border-gray-200' :
                                                aidaStatus === 'Awareness' ? 'bg-pink-100 text-pink-700' :
                                                aidaStatus === 'Interest' ? 'bg-yellow-100 text-yellow-700' :
                                                aidaStatus === 'Desire' ? 'bg-blue-100 text-blue-700' :
                                                aidaStatus === 'Action' ? 'bg-green-100 text-green-700' :
                                                'bg-white text-gray-700 border border-gray-200';

                                            return (
                                                <div 
                                                    key={opportunity.id} 
                                                    className="bg-white border border-gray-200 rounded-lg p-3 hover:border-green-300 transition cursor-pointer"
                                                    onClick={(e) => {
                                                        // Don't open if clicking edit/delete buttons
                                                        if (e.target.closest('button')) return;
                                                        if (onOpenOpportunity) {
                                                            onOpenOpportunity(opportunity.id, client);
                                                        }
                                                    }}
                                                >
                                                    <div className="flex justify-between items-start">
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <i className="fas fa-bullseye text-green-600"></i>
                                                                <h4 className="font-semibold text-gray-900 text-sm">{opportunity.title || opportunity.name}</h4>
                                                                <span className={`px-2 py-0.5 text-xs rounded font-medium ${stageColor}`}>
                                                                    {aidaStatus}
                                                                </span>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600 mb-2">
                                                                {opportunity.expectedCloseDate && (
                                                                    <div>
                                                                        <i className="fas fa-calendar mr-1.5 w-4"></i>
                                                                        Expected: {opportunity.expectedCloseDate}
                                                                    </div>
                                                                )}
                                                                {relatedSite && (
                                                                    <div className="col-span-2">
                                                                        <i className="fas fa-map-marker-alt mr-1.5 w-4"></i>
                                                                        {relatedSite.name}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {opportunity.notes && (
                                                                <div className="mt-2 text-xs text-gray-600 bg-gray-50 p-2 rounded">
                                                                    {opportunity.notes}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleEditOpportunity(opportunity)}
                                                                className="text-green-600 hover:text-green-700 p-1"
                                                                title="Edit"
                                                            >
                                                                <i className="fas fa-edit"></i>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteOpportunity(opportunity.id)}
                                                                className="text-red-600 hover:text-red-700 p-1"
                                                                title="Delete"
                                                            >
                                                                <i className="fas fa-trash"></i>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>

                            </div>
                        )}

                        {/* Calendar/Follow-ups Tab */}
                        {activeTab === 'calendar' && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-lg font-semibold text-gray-900">Follow-ups & Meetings</h3>
                                </div>

                                {/* Subscribe to calendar (iCal feed) */}
                                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                                    <h4 className="font-medium text-gray-900 mb-2 text-sm flex items-center gap-2">
                                        <i className="fas fa-calendar-plus text-blue-600"></i>
                                        Subscribe to calendar
                                    </h4>
                                    <p className="text-xs text-gray-600 mb-2">
                                        Add this feed to Google Calendar, Outlook, or Apple Calendar to see follow-ups in your calendar. Your app will refresh the feed periodically.
                                    </p>
                                    {calendarFeedLoading ? (
                                        <p className="text-sm text-gray-500"><i className="fas fa-spinner fa-spin mr-1"></i>Loading feed URL…</p>
                                    ) : calendarFeedUrl ? (
                                        <>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <input
                                                    type="text"
                                                    readOnly
                                                    value={calendarFeedUrl}
                                                    className="flex-1 min-w-0 text-xs px-2 py-1.5 bg-white border border-gray-300 rounded truncate"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(calendarFeedUrl).then(() => alert('Calendar feed URL copied. Paste it in your calendar app (e.g. Google Calendar → Add calendar → From URL).')).catch(() => {});
                                                    }}
                                                    className="px-2 py-1.5 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 whitespace-nowrap"
                                                >
                                                    <i className="fas fa-copy mr-1"></i>Copy URL
                                                </button>
                                                <a
                                                    href={calendarFeedUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="px-2 py-1.5 text-xs bg-gray-200 text-gray-800 rounded hover:bg-gray-300 whitespace-nowrap"
                                                >
                                                    <i className="fas fa-external-link-alt mr-1"></i>Open feed
                                                </a>
                                                <button
                                                    type="button"
                                                    disabled={calendarFeedVerify === 'checking'}
                                                    onClick={async () => {
                                                        setCalendarFeedVerify('checking');
                                                        try {
                                                            const res = await fetch(calendarFeedUrl);
                                                            const text = await res.text();
                                                            if (!res.ok) {
                                                                setCalendarFeedVerify({ error: res.status === 401 ? 'Invalid or expired link' : `HTTP ${res.status}` });
                                                                return;
                                                            }
                                                            const count = (text.match(/BEGIN:VEVENT/g) || []).length;
                                                            setCalendarFeedVerify({ count });
                                                        } catch (e) {
                                                            setCalendarFeedVerify({ error: e.message || 'Network error' });
                                                        }
                                                    }}
                                                    className="px-2 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 whitespace-nowrap disabled:opacity-50"
                                                >
                                                    {calendarFeedVerify === 'checking' ? <i className="fas fa-spinner fa-spin mr-1"></i> : <i className="fas fa-check-circle mr-1"></i>}
                                                    Verify feed
                                                </button>
                                            </div>
                                            {calendarFeedVerify && calendarFeedVerify !== 'checking' && (
                                                <p className="text-xs mt-2">
                                                    {calendarFeedVerify.count !== undefined ? (
                                                        <span className="text-green-700"><i className="fas fa-check mr-1"></i>Feed OK – {calendarFeedVerify.count} event{calendarFeedVerify.count !== 1 ? 's' : ''} in feed. Your calendar app may take several hours to refresh.</span>
                                                    ) : (
                                                        <span className="text-red-700"><i className="fas fa-exclamation-triangle mr-1"></i>{calendarFeedVerify.error}</span>
                                                    )}
                                                </p>
                                            )}
                                        </>
                                    ) : (
                                        <p className="text-sm text-gray-500">Sign in to get your calendar feed URL.</p>
                                    )}
                                </div>

                                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                    <h4 className="font-medium text-gray-900 mb-3 text-sm">Schedule Follow-up</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Date *</label>
                                            <input
                                                type="date"
                                                value={newFollowUp.date}
                                                onChange={(e) => setNewFollowUp({...newFollowUp, date: e.target.value})}
                                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Time</label>
                                            <input
                                                type="time"
                                                value={newFollowUp.time}
                                                onChange={(e) => setNewFollowUp({...newFollowUp, time: e.target.value})}
                                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                                            <select
                                                value={newFollowUp.type}
                                                onChange={(e) => setNewFollowUp({...newFollowUp, type: e.target.value})}
                                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                            >
                                                <option>Call</option>
                                                <option>Meeting</option>
                                                <option>Email</option>
                                                <option>Visit</option>
                                            </select>
                                        </div>
                                        <div className="col-span-2">
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Description *</label>
                                            <textarea
                                                value={newFollowUp.description}
                                                onChange={(e) => setNewFollowUp({...newFollowUp, description: e.target.value})}
                                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                rows="2"
                                                placeholder="What needs to be discussed..."
                                            ></textarea>
                                        </div>
                                    </div>
                                    <div className="flex justify-end mt-3">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                handleAddFollowUp();
                                            }}
                                            className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                                        >
                                            <i className="fas fa-plus mr-1.5"></i>
                                            Add Follow-up
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <h4 className="font-medium text-gray-900 text-sm">Upcoming Follow-ups</h4>
                                    {upcomingFollowUps.length === 0 ? (
                                        <div className="text-center py-8 text-gray-500 text-sm">
                                            <i className="fas fa-calendar-alt text-3xl mb-2"></i>
                                            <p>No upcoming follow-ups scheduled</p>
                                        </div>
                                    ) : (
                                        upcomingFollowUps.map(followUp => (
                                            <div key={followUp.id} className="bg-white border border-gray-200 rounded-lg p-3">
                                                {editingFollowUp && editingFollowUp.id === followUp.id ? (
                                                    <div className="space-y-3">
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                            <div>
                                                                <label className="block text-xs font-medium text-gray-700 mb-1">Date *</label>
                                                                <input
                                                                    type="date"
                                                                    value={editingFollowUp.date}
                                                                    onChange={(e) => setEditingFollowUp({ ...editingFollowUp, date: e.target.value })}
                                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs font-medium text-gray-700 mb-1">Time</label>
                                                                <input
                                                                    type="time"
                                                                    value={editingFollowUp.time}
                                                                    onChange={(e) => setEditingFollowUp({ ...editingFollowUp, time: e.target.value })}
                                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                                                                <select
                                                                    value={editingFollowUp.type}
                                                                    onChange={(e) => setEditingFollowUp({ ...editingFollowUp, type: e.target.value })}
                                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                                >
                                                                    <option>Call</option>
                                                                    <option>Meeting</option>
                                                                    <option>Email</option>
                                                                    <option>Visit</option>
                                                                </select>
                                                            </div>
                                                            <div className="col-span-2">
                                                                <label className="block text-xs font-medium text-gray-700 mb-1">Description *</label>
                                                                <textarea
                                                                    value={editingFollowUp.description}
                                                                    onChange={(e) => setEditingFollowUp({ ...editingFollowUp, description: e.target.value })}
                                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                                    rows="2"
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="flex justify-end gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={handleCancelFollowUpEdit}
                                                                className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                                                            >
                                                                Cancel
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={handleSaveFollowUpEdit}
                                                                className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                                                            >
                                                                Save
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex justify-between items-start">
                                                        <div className="flex items-start gap-3 flex-1">
                                                            <input
                                                                type="checkbox"
                                                                checked={followUp.completed}
                                                                onChange={() => handleToggleFollowUp(followUp.id)}
                                                                className="mt-1"
                                                            />
                                                            <div className="flex-1">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                                                                        followUp.type === 'Call' ? 'bg-blue-100 text-blue-700' :
                                                                        followUp.type === 'Meeting' ? 'bg-primary-100 text-primary-700' :
                                                                        followUp.type === 'Email' ? 'bg-green-100 text-green-700' :
                                                                        'bg-gray-100 text-gray-700'
                                                                    }`}>
                                                                        {followUp.type}
                                                                    </span>
                                                                    <span className="text-sm font-medium text-gray-900">
                                                                        {followUp.date} {followUp.time && `at ${followUp.time}`}
                                                                    </span>
                                                                </div>
                                                                <p className="text-sm text-gray-600">{followUp.description}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleEditFollowUp(followUp)}
                                                                className="text-gray-600 hover:text-gray-800 p-1"
                                                                title="Edit"
                                                            >
                                                                <i className="fas fa-edit"></i>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteFollowUp(followUp.id)}
                                                                className="text-red-600 hover:text-red-700 p-1"
                                                                title="Delete"
                                                            >
                                                                <i className="fas fa-trash"></i>
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>

                                {formData.followUps?.filter(f => f.completed).length > 0 && (
                                    <div className="space-y-2">
                                        <h4 className="font-medium text-gray-900 text-sm">Completed Follow-ups</h4>
                                        {formData.followUps.filter(f => f.completed).map(followUp => (
                                            <div key={followUp.id} className="bg-gray-50 border border-gray-200 rounded-lg p-3 opacity-60">
                                                {editingFollowUp && editingFollowUp.id === followUp.id ? (
                                                    <div className="space-y-3">
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                            <div>
                                                                <label className="block text-xs font-medium text-gray-700 mb-1">Date *</label>
                                                                <input
                                                                    type="date"
                                                                    value={editingFollowUp.date}
                                                                    onChange={(e) => setEditingFollowUp({ ...editingFollowUp, date: e.target.value })}
                                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs font-medium text-gray-700 mb-1">Time</label>
                                                                <input
                                                                    type="time"
                                                                    value={editingFollowUp.time}
                                                                    onChange={(e) => setEditingFollowUp({ ...editingFollowUp, time: e.target.value })}
                                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                                                                <select
                                                                    value={editingFollowUp.type}
                                                                    onChange={(e) => setEditingFollowUp({ ...editingFollowUp, type: e.target.value })}
                                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                                >
                                                                    <option>Call</option>
                                                                    <option>Meeting</option>
                                                                    <option>Email</option>
                                                                    <option>Visit</option>
                                                                </select>
                                                            </div>
                                                            <div className="col-span-2">
                                                                <label className="block text-xs font-medium text-gray-700 mb-1">Description *</label>
                                                                <textarea
                                                                    value={editingFollowUp.description}
                                                                    onChange={(e) => setEditingFollowUp({ ...editingFollowUp, description: e.target.value })}
                                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                                    rows="2"
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="flex justify-end gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={handleCancelFollowUpEdit}
                                                                className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                                                            >
                                                                Cancel
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={handleSaveFollowUpEdit}
                                                                className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                                                            >
                                                                Save
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex justify-between items-start">
                                                        <div className="flex items-start gap-3 flex-1">
                                                            <input
                                                                type="checkbox"
                                                                checked={true}
                                                                onChange={() => handleToggleFollowUp(followUp.id)}
                                                                className="mt-1"
                                                            />
                                                            <div className="flex-1">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <span className="px-2 py-0.5 text-xs rounded font-medium bg-gray-200 text-gray-700">
                                                                        {followUp.type}
                                                                    </span>
                                                                    <span className="text-sm font-medium text-gray-900 line-through">
                                                                        {followUp.date} {followUp.time && `at ${followUp.time}`}
                                                                    </span>
                                                                </div>
                                                                <p className="text-sm text-gray-600 line-through">{followUp.description}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleEditFollowUp(followUp)}
                                                                className="text-gray-600 hover:text-gray-800 p-1"
                                                                title="Edit"
                                                            >
                                                                <i className="fas fa-edit"></i>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteFollowUp(followUp.id)}
                                                                className="text-red-600 hover:text-red-700 p-1"
                                                                title="Delete"
                                                            >
                                                                <i className="fas fa-trash"></i>
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Projects Tab */}
                        {activeTab === 'projects' && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-lg font-semibold text-gray-900">Projects</h3>
                                    <div className="text-sm text-gray-600">
                                        {clientProjects.length} project{clientProjects.length !== 1 ? 's' : ''}
                                    </div>
                                </div>

                                {clientProjects.length > 0 ? (
                                    <div className="space-y-2">
                                        {clientProjects.map(project => (
                                            <div 
                                                key={project.id} 
                                                className="bg-white border border-gray-200 rounded-lg p-3 hover:border-primary-300 hover:shadow-sm transition cursor-pointer group"
                                                onClick={() => {
                                                    if (onNavigateToProject) {
                                                        onNavigateToProject(project.id);
                                                    }
                                                }}
                                            >
                                                <div className="flex justify-between items-start">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <h4 className="font-semibold text-gray-900 text-sm group-hover:text-primary-600 transition-colors">
                                                                {project.name}
                                                            </h4>
                                                            <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                                                                project.status === 'In Progress' ? 'bg-blue-100 text-blue-700' :
                                                                project.status === 'Review' ? 'bg-yellow-100 text-yellow-700' :
                                                                project.status === 'Completed' ? 'bg-green-100 text-green-700' :
                                                                'bg-gray-100 text-gray-700'
                                                            }`}>
                                                                {project.status}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs text-gray-600 space-y-0.5">
                                                            <div><i className="fas fa-tag mr-1.5 w-4"></i>{project.type}</div>
                                                            <div><i className="fas fa-calendar mr-1.5 w-4"></i>{project.startDate} - {project.dueDate}</div>
                                                            <div><i className="fas fa-user mr-1.5 w-4"></i>{project.assignedTo}</div>
                                                            {project.tasks && (
                                                                <div><i className="fas fa-tasks mr-1.5 w-4"></i>{project.tasks.length} tasks</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <i className="fas fa-arrow-right text-primary-600 text-sm"></i>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-8 text-gray-500 text-sm">
                                        <i className="fas fa-folder-open text-3xl mb-2"></i>
                                        <p>No projects found for this client</p>
                                        <p className="text-xs mt-1">Create projects with client name "{formData.name}" to see them here</p>
                                    </div>
                                )}

                                {/* Info box */}
                                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/50 dark:bg-blue-950/30">
                                    <div className="flex items-start">
                                        <i className="fas fa-info-circle text-blue-600 text-xs mt-0.5 mr-2"></i>
                                        <div>
                                            <p className="text-xs font-medium text-blue-900 mb-1">How Projects Work</p>
                                            <p className="text-xs text-blue-800">
                                                Projects are automatically shown here when their "Client" field matches this client's name. 
                                                Click on any project to view its full details in the Projects module.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Service & Maintenance Tab */}
                        {activeTab === 'service-maintenance' && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-lg font-semibold text-gray-900">Incident reports</h3>
                                    <div className="text-sm text-gray-600">
                                        {incidentReports.length} incident{incidentReports.length !== 1 ? 's' : ''}
                                    </div>
                                </div>

                                {loadingIncidentReports ? (
                                    <div className="text-center py-6 text-gray-500 text-sm">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto mb-2"></div>
                                        <p>Loading incident reports...</p>
                                    </div>
                                ) : incidentReports.length > 0 ? (
                                    <div className="space-y-2">
                                        {incidentReports.map((incident) => (
                                            <div
                                                key={incident.id}
                                                className="bg-white border border-gray-200 rounded-lg p-3 hover:border-amber-300 hover:shadow-sm transition cursor-pointer"
                                                onClick={() => handleIncidentReportClick(incident)}
                                            >
                                                <div className="flex justify-between items-start">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <h4 className="font-semibold text-gray-900 text-sm">
                                                                {incident.incidentNumber || `Incident #${incident.id.slice(0, 8)}`}
                                                            </h4>
                                                            <span className="px-2 py-0.5 text-xs rounded font-medium bg-amber-100 text-amber-800">
                                                                {incident.status || 'draft'}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs text-gray-600 space-y-0.5">
                                                            {incident.incidentType && (
                                                                <div><i className="fas fa-exclamation-triangle mr-1.5 w-4"></i>{incident.incidentType}</div>
                                                            )}
                                                            {incident.siteName && (
                                                                <div><i className="fas fa-map-marker-alt mr-1.5 w-4"></i>{incident.siteName}</div>
                                                            )}
                                                            {incident.reportedByName && (
                                                                <div><i className="fas fa-user mr-1.5 w-4"></i>{incident.reportedByName}</div>
                                                            )}
                                                            {(incident.incidentAt || incident.createdAt) && (
                                                                <div><i className="fas fa-calendar mr-1.5 w-4"></i>{new Date(incident.incidentAt || incident.createdAt).toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</div>
                                                            )}
                                                            {incident.description && (
                                                                <div className="mt-1 text-xs text-gray-500 italic">{incident.description.substring(0, 100)}{incident.description.length > 100 ? '...' : ''}</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-6 text-gray-500 text-sm border border-dashed border-gray-200 rounded-lg">
                                        <i className="fas fa-triangle-exclamation text-2xl mb-2"></i>
                                        <p>No incident reports for this client</p>
                                    </div>
                                )}

                                <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                                    <h3 className="text-lg font-semibold text-gray-900">Service & Maintenance Job Cards</h3>
                                    <div className="text-sm text-gray-600">
                                        {jobCards.length} job card{jobCards.length !== 1 ? 's' : ''}
                                    </div>
                                </div>

                                {loadingJobCards ? (
                                    <div className="text-center py-8 text-gray-500 text-sm">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto mb-2"></div>
                                        <p>Loading job cards...</p>
                                    </div>
                                ) : jobCards.length > 0 ? (
                                    <div className="space-y-2">
                                        {jobCards.map(jobCard => (
                                            <div 
                                                key={jobCard.id} 
                                                className="bg-white border border-gray-200 rounded-lg p-3 hover:border-blue-300 hover:shadow-sm transition cursor-pointer"
                                                onClick={() => handleJobCardClick(jobCard)}
                                            >
                                                <div className="flex justify-between items-start">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <h4 className="font-semibold text-gray-900 text-sm">
                                                                {jobCard.jobCardNumber || `Job Card #${jobCard.id.slice(0, 8)}`}
                                                            </h4>
                                                            <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                                                                jobCard.status === 'completed' ? 'bg-green-100 text-green-700' :
                                                                jobCard.status === 'submitted' ? 'bg-blue-100 text-blue-700' :
                                                                'bg-gray-100 text-gray-700'
                                                            }`}>
                                                                {jobCard.status || 'draft'}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs text-gray-600 space-y-0.5">
                                                            {jobCard.reasonForVisit && (
                                                                <div><i className="fas fa-info-circle mr-1.5 w-4"></i>{jobCard.reasonForVisit}</div>
                                                            )}
                                                            {jobCard.siteName && (
                                                                <div><i className="fas fa-map-marker-alt mr-1.5 w-4"></i>{jobCard.siteName}</div>
                                                            )}
                                                            {jobCard.agentName && (
                                                                <div><i className="fas fa-user mr-1.5 w-4"></i>{jobCard.agentName}</div>
                                                            )}
                                                            {(jobCard.startedAt || jobCard.createdAt) && (
                                                                <div><i className="fas fa-calendar mr-1.5 w-4"></i>{new Date(jobCard.startedAt || jobCard.createdAt).toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</div>
                                                            )}
                                                            {jobCard.diagnosis && (
                                                                <div className="mt-1 text-xs text-gray-500 italic">{jobCard.diagnosis.substring(0, 100)}{jobCard.diagnosis.length > 100 ? '...' : ''}</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-8 text-gray-500 text-sm">
                                        <i className="fas fa-wrench text-3xl mb-2"></i>
                                        <p>No job cards found for this client</p>
                                        <p className="text-xs mt-1">Job cards will appear here when they are created for this client</p>
                                    </div>
                                )}

                                {/* Info box */}
                                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/50 dark:bg-blue-950/30">
                                    <div className="flex items-start">
                                        <i className="fas fa-info-circle text-blue-600 text-xs mt-0.5 mr-2"></i>
                                        <div>
                                            <p className="text-xs font-medium text-blue-900 mb-1">Service & Maintenance Job Cards</p>
                                            <p className="text-xs text-blue-800">
                                                Job cards are automatically shown here when they are created for this client. 
                                                View the full Service & Maintenance module to create new job cards.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Contracts Tab */}
                        {activeTab === 'contracts' && canViewContracts && (
                            <div className="space-y-4">
                                {/* Billing Terms Section */}
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Billing Terms</h3>
                                    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Payment Terms</label>
                                                <select
                                                    value={formData.billingTerms?.paymentTerms || 'Net 30'}
                                                    onChange={(e) => setFormData({
                                                        ...formData,
                                                        billingTerms: { ...formData.billingTerms, paymentTerms: e.target.value }
                                                    })}
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                >
                                                    <option>Due on Receipt</option>
                                                    <option>Net 7</option>
                                                    <option>Net 15</option>
                                                    <option>Net 30</option>
                                                    <option>Net 45</option>
                                                    <option>Net 60</option>
                                                    <option>Net 90</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Billing Frequency</label>
                                                <select
                                                    value={formData.billingTerms?.billingFrequency || 'Monthly'}
                                                    onChange={(e) => setFormData({
                                                        ...formData,
                                                        billingTerms: { ...formData.billingTerms, billingFrequency: e.target.value }
                                                    })}
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                >
                                                    <option>Per Project</option>
                                                    <option>Weekly</option>
                                                    <option>Bi-Weekly</option>
                                                    <option>Monthly</option>
                                                    <option>Quarterly</option>
                                                    <option>Annually</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Monthly Retainer (R)</label>
                                                <input
                                                    type="number"
                                                    value={formData.billingTerms?.retainerAmount || 0}
                                                    onChange={(e) => setFormData({
                                                        ...formData,
                                                        billingTerms: { ...formData.billingTerms, retainerAmount: parseFloat(e.target.value) || 0 }
                                                    })}
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                    min="0"
                                                    step="0.01"
                                                />
                                            </div>
                                            <div className="flex items-end">
                                                <label className="flex items-center cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={formData.billingTerms?.taxExempt || false}
                                                        onChange={(e) => setFormData({
                                                            ...formData,
                                                            billingTerms: { ...formData.billingTerms, taxExempt: e.target.checked }
                                                        })}
                                                        className="mr-2"
                                                    />
                                                    <span className="text-xs font-medium text-gray-700">VAT Exempt</span>
                                                </label>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Billing Notes</label>
                                            <textarea
                                                value={formData.billingTerms?.notes || ''}
                                                onChange={(e) => setFormData({
                                                    ...formData,
                                                    billingTerms: { ...formData.billingTerms, notes: e.target.value }
                                                })}
                                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                rows="2"
                                                placeholder="Special billing instructions or notes..."
                                            ></textarea>
                                        </div>
                                    </div>
                                </div>

                                {/* Contract Documents Section */}
                                <div>
                                    <div className="flex justify-between items-center mb-3">
                                        <h3 className="text-lg font-semibold text-gray-900">Contract Documents</h3>
                                        <label className="bg-primary-600 text-white px-3 py-1.5 text-sm rounded-lg hover:bg-primary-700 cursor-pointer flex items-center">
                                            <i className="fas fa-upload mr-1.5"></i>
                                            Upload Contract
                                            <input
                                                type="file"
                                                accept=".pdf,.doc,.docx"
                                                onChange={async (e) => {
                                                    const file = e.target.files[0];
                                                    if (file) {
                                                        try {
                                                            const reader = new FileReader();
                                                            reader.onload = async (event) => {
                                                                try {
                                                                    const dataUrl = event.target.result;
                                                                    // Upload to server
                                                                    const token = window.storage?.getToken?.();
                                                                    const res = await fetch('/api/files', {
                                                                        method: 'POST',
                                                                        headers: {
                                                                            'Content-Type': 'application/json',
                                                                            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                                                                        },
                                                                        body: JSON.stringify({
                                                                            folder: 'contracts',
                                                                            name: file.name,
                                                                            dataUrl
                                                                        })
                                                                    });
                                                                    if (!res.ok) {
                                                                        const errorData = await res.json().catch(() => ({}));
                                                                        throw new Error(errorData.error?.message || `Upload failed (${res.status})`);
                                                                    }
                                                                    const json = await res.json();
                                                                    // Handle both wrapped { data: { url: ... } } and direct { url: ... } responses
                                                                    const fileUrl = json.data?.url || json.url;
                                                                    if (!fileUrl) {
                                                                        throw new Error('No URL returned from server');
                                                                    }
                                                                    const newContract = {
                                                                        id: Date.now(),
                                                                        name: file.name,
                                                                        size: file.size,
                                                                        type: file.type,
                                                                        uploadDate: new Date().toISOString(),
                                                                        url: fileUrl
                                                                    };
                                                                    const updatedFormData = {
                                                                        ...formData,
                                                                        contracts: [...(formData.contracts || []), newContract]
                                                                    };
                                                                    setFormData(updatedFormData);
                                                                    // Log activity and auto-save (activity log will be saved automatically)
                                                                    logActivity('Contract Uploaded', `Uploaded to server: ${file.name}`, null, true, updatedFormData);
                                                                } catch (err) {
                                                                    console.error('Contract upload error:', err);
                                                                    alert('Failed to upload contract to server.');
                                                                }
                                                            };
                                                            reader.readAsDataURL(file);
                                                        } catch (readErr) {
                                                            console.error('File read error:', readErr);
                                                        }
                                                    }
                                                    e.target.value = '';
                                                }}
                                                className="hidden"
                                            />
                                        </label>
                                    </div>

                                    {(!formData.contracts || formData.contracts.length === 0) ? (
                                        <div className="text-center py-8 text-gray-500 text-sm bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                                            <i className="fas fa-file-contract text-3xl mb-2"></i>
                                            <p>No contracts uploaded</p>
                                            <p className="text-xs mt-1">Upload PDF or Word documents</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {formData.contracts.map(contract => (
                                                <div key={contract.id} className="bg-white border border-gray-200 rounded-lg p-3 hover:border-primary-300 transition">
                                                    <div className="flex justify-between items-start">
                                                        <div className="flex items-start gap-3 flex-1">
                                                            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                                                <i className="fas fa-file-pdf text-red-600"></i>
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <h4 className="font-medium text-gray-900 text-sm truncate">{contract.name}</h4>
                                                                <div className="flex items-center gap-3 text-xs text-gray-600 mt-0.5">
                                                                    <span><i className="fas fa-calendar mr-1"></i>{new Date(contract.uploadDate).toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</span>
                                                                    <span><i className="fas fa-file mr-1"></i>{(contract.size / 1024).toFixed(1)} KB</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <a
                                                                href={contract.url}
                                                                download={contract.name}
                                                                className="text-primary-600 hover:text-primary-700 p-1"
                                                                title="Download"
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                            >
                                                                <i className="fas fa-download"></i>
                                                            </a>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    if (confirm('Delete this contract?')) {
                                                                        const contractToDelete = formData.contracts.find(c => c.id === contract.id);
                                                                        const updatedFormData = {
                                                                            ...formData,
                                                                            contracts: formData.contracts.filter(c => c.id !== contract.id)
                                                                        };
                                                                        setFormData(updatedFormData);
                                                                        // Log activity and auto-save (activity log will be saved automatically)
                                                                        logActivity('Contract Deleted', `Deleted: ${contractToDelete?.name}`, null, true, updatedFormData);
                                                                    }
                                                                }}
                                                                className="text-red-600 hover:text-red-700 p-1"
                                                                title="Delete"
                                                            >
                                                                <i className="fas fa-trash"></i>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Info box */}
                                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/50 dark:bg-blue-950/30">
                                    <div className="flex items-start">
                                        <i className="fas fa-info-circle text-blue-600 text-xs mt-0.5 mr-2"></i>
                                        <div>
                                            <p className="text-xs font-medium text-blue-900 mb-1">Contract Management</p>
                                            <p className="text-xs text-blue-800">
                                                Upload signed contracts, service agreements, and NDAs. Set billing terms to automate invoicing. 
                                                All documents are stored securely in your browser's local storage.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Activity Timeline Tab */}
                        {activeTab === 'activity' && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-lg font-semibold text-gray-900">Activity Timeline</h3>
                                    <div className="text-sm text-gray-600">
                                        {(formData.activityLog || []).length} activities
                                    </div>
                                </div>

                                {(!formData.activityLog || formData.activityLog.length === 0) ? (
                                    <div className="text-center py-8 text-gray-500 text-sm">
                                        <i className="fas fa-history text-3xl mb-2"></i>
                                        <p>No activity recorded yet</p>
                                        <p className="text-xs mt-1">Activity will be logged automatically as you interact with this client</p>
                                    </div>
                                ) : (
                                    <div className="relative">
                                        {/* Timeline line */}
                                        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>
                                        
                                        <div className="space-y-4">
                                            {[...(formData.activityLog || [])].reverse().map((activity, index) => {
                                                const activityIcon = 
                                                    activity.type === 'Contact Added' ? 'user-plus' :
                                                    activity.type === 'Contact Updated' ? 'user-edit' :
                                                    activity.type === 'Contact Deleted' ? 'user-minus' :
                                                    activity.type === 'Site Added' ? 'map-marker-alt' :
                                                    activity.type === 'Site Updated' ? 'map-marked-alt' :
                                                    activity.type === 'Site Deleted' ? 'map-marker-slash' :
                                                    activity.type === 'Opportunity Added' ? 'bullseye' :
                                                    activity.type === 'Opportunity Updated' ? 'chart-line' :
                                                    activity.type === 'Opportunity Deleted' ? 'times-circle' :
                                                    activity.type === 'Follow-up Added' ? 'calendar-plus' :
                                                    activity.type === 'Follow-up Completed' ? 'calendar-check' :
                                                    activity.type === 'Follow-up Deleted' ? 'calendar-times' :
                                                    activity.type === 'Comment Added' ? 'comment' :
                                                    activity.type === 'Contract Uploaded' ? 'file-upload' :
                                                    activity.type === 'Contract Deleted' ? 'file-times' :
                                                    activity.type === 'Status Changed' ? 'toggle-on' :
                                                    activity.type === 'Project Linked' ? 'link' :
                                                    'info-circle';

                                                const activityColor = 
                                                    activity.type.includes('Deleted') ? 'bg-red-100 text-red-600 border-red-200' :
                                                    activity.type.includes('Completed') ? 'bg-green-100 text-green-600 border-green-200' :
                                                    activity.type.includes('Opportunity') && !activity.type.includes('Deleted') ? 'bg-green-100 text-green-600 border-green-200' :
                                                    activity.type.includes('Added') || activity.type.includes('Uploaded') ? 'bg-blue-100 text-blue-600 border-blue-200' :
                                                    'bg-gray-100 text-gray-600 border-gray-200';

                                                return (
                                                    <div key={activity.id} className="relative flex items-start gap-3 pl-2">
                                                        <div className={`w-8 h-8 rounded-full ${activityColor} border-2 flex items-center justify-center flex-shrink-0 bg-white z-10`}>
                                                            <i className={`fas fa-${activityIcon} text-xs`}></i>
                                                        </div>
                                                        <div className="flex-1 bg-white border border-gray-200 rounded-lg p-3 hover:border-primary-300 transition">
                                                            <div className="flex justify-between items-start mb-1">
                                                                <div className="font-medium text-gray-900 text-sm">{activity.type}</div>
                                                                <div className="text-xs text-gray-500">
                                                                    {new Date(activity.timestamp).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}
                                                                </div>
                                                            </div>
                                                            <div className="text-sm text-gray-600">{activity.description}</div>
                                                            {activity.user && (
                                                                <div className="text-xs text-gray-500 mt-1">
                                                                    <i className="fas fa-user mr-1"></i>{activity.user}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Info box */}
                                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/50 dark:bg-blue-950/30">
                                    <div className="flex items-start">
                                        <i className="fas fa-info-circle text-blue-600 text-xs mt-0.5 mr-2"></i>
                                        <div>
                                            <p className="text-xs font-medium text-blue-900 mb-1">Activity Tracking</p>
                                            <p className="text-xs text-blue-800">
                                                All major actions are automatically logged in the activity timeline, providing a complete history 
                                                of your interactions with this client.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}


                        {/* Notes Tab — client notes (ClientNote table, same UX as Project Notes) */}
                        {activeTab === 'notes' && (
                            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col min-h-[400px]">
                                {editingClientNoteFull ? (
                                    <div className="flex flex-col flex-1 min-h-0">
                                        <div className="flex items-center gap-2 p-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => { setEditingClientNoteFull(null); setClientNoteActivityForEditor([]); }}
                                                className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors flex items-center gap-2"
                                            >
                                                <i className="fas fa-arrow-left"></i>
                                                Back to list
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setEditorClientNoteActivityPanelOpen(prev => !prev)}
                                                className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-2 ${editorClientNoteActivityPanelOpen ? 'bg-primary-100 text-primary-800 border border-primary-300' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}`}
                                            >
                                                <i className="fas fa-history"></i>
                                                Activity
                                                <i className={`fas fa-chevron-${editorClientNoteActivityPanelOpen ? 'right' : 'left'} text-xs`}></i>
                                            </button>
                                        </div>
                                        <div className="flex flex-1 min-h-0">
                                            <div className="flex-1 min-w-0 overflow-hidden">
                                                {window.NoteEditor ? (
                                                    React.createElement(window.NoteEditor, {
                                                        note: editingClientNoteFull,
                                                        allTags: [],
                                                        clients: [],
                                                        projects: [],
                                                        clientProjects: [],
                                                        onSave: handleSaveClientNote,
                                                        onDelete: handleDeleteClientNote,
                                                        onShare: () => {},
                                                        onTogglePin: () => {},
                                                        onExport: () => {},
                                                        isSaving: isSavingClientNote,
                                                        lastSavedAt: null,
                                                        isDark: isDark,
                                                        isProjectNote: true
                                                    })
                                                ) : (
                                                    <div className="p-8 text-center">
                                                        <i className="fas fa-spinner fa-spin text-2xl text-primary-500 mb-2" aria-hidden="true"></i>
                                                        <p className="text-gray-500">Loading editor…</p>
                                                    </div>
                                                )}
                                            </div>
                                            {editorClientNoteActivityPanelOpen && (
                                                <div className={`w-80 flex-shrink-0 border-l flex flex-col ${isDark ? 'border-gray-600 bg-gray-700/50' : 'border-gray-200 bg-gray-50'}`}>
                                                    <div className={`p-3 border-b flex items-center justify-between ${isDark ? 'border-gray-600' : 'border-gray-200'}`}>
                                                        <h4 className="text-sm font-semibold text-gray-800">Note activity</h4>
                                                        <button type="button" onClick={() => setEditorClientNoteActivityPanelOpen(false)} className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded" aria-label="Close activity panel">
                                                            <i className="fas fa-times"></i>
                                                        </button>
                                                    </div>
                                                    <div className="p-3 overflow-y-auto flex-1">
                                                        {clientNoteActivityForEditor.length === 0 ? (
                                                            <p className="text-xs text-gray-500">No activity recorded for this note yet.</p>
                                                        ) : (
                                                            <div className="space-y-2">
                                                                {clientNoteActivityForEditor.map((log) => {
                                                                    const meta = (() => { try { return typeof log.metadata === 'string' ? JSON.parse(log.metadata || '{}') : (log.metadata || {}); } catch (_) { return {}; } })();
                                                                    const dateStr = log.createdAt ? new Date(log.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '';
                                                                    const changes = Array.isArray(meta.changes) ? meta.changes : [];
                                                                    return (
                                                                        <div key={log.id} className={`border rounded-lg p-3 text-xs ${isDark ? 'border-gray-600 bg-gray-800 text-gray-200' : 'border-gray-200 bg-white text-gray-800'}`}>
                                                                            <div className="flex flex-wrap items-center gap-2">
                                                                                <span className="px-1.5 py-0.5 rounded bg-gray-200 text-gray-700">{String(log.type || '').replace(/_/g, ' ')}</span>
                                                                                <span className="text-gray-500">{log.userName || 'System'}</span>
                                                                                <span className="text-gray-400">{dateStr}</span>
                                                                            </div>
                                                                            {changes.length > 0 ? (
                                                                                <ul className="mt-2 list-disc list-inside text-gray-600 space-y-0.5">
                                                                                    {changes.map((c, i) => (
                                                                                        <li key={i}>{c}</li>
                                                                                    ))}
                                                                                </ul>
                                                                            ) : log.description ? (
                                                                                <div className="mt-1.5 text-gray-600">{log.description}</div>
                                                                            ) : null}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                        <button type="button" onClick={() => editingClientNoteFull?.id && loadActivityForClientNote(editingClientNoteFull.id).then(setClientNoteActivityForEditor)} className="mt-3 px-2 py-1 text-xs text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded">
                                                            <i className="fas fa-sync-alt mr-1"></i> Refresh
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="p-4">
                                            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                                <i className="fas fa-sticky-note text-primary-600"></i>
                                                Notes
                                            </h3>
                                            <div className="flex flex-wrap items-center gap-2 mb-3">
                                                <button type="button" onClick={createClientNote} disabled={isSavingClientNote} className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50 flex items-center gap-2">
                                                    <i className="fas fa-plus"></i>
                                                    Create note
                                                </button>
                                                <button type="button" onClick={() => loadClientNotes()} className="px-2 py-1 text-xs text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded">
                                                    <i className="fas fa-sync-alt mr-1"></i> Refresh
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex gap-0 min-h-0 flex-1 px-4 pb-4">
                                            <div className="flex-1 min-w-0 space-y-4 max-h-[60vh] overflow-y-auto">
                                                {clientNotesList === null ? (
                                                    <p className="text-sm text-gray-500">Loading…</p>
                                                ) : !clientNotesList || clientNotesList.length === 0 ? (
                                                    <p className="text-sm text-gray-500">No notes yet. Click &quot;Create note&quot; to add one.</p>
                                                ) : (
                                                    clientNotesList.map((note) => (
                                                        <div
                                                            key={note.id}
                                                            role="button"
                                                            tabIndex={0}
                                                            onClick={() => setEditingClientNoteFull(note)}
                                                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditingClientNoteFull(note); } }}
                                                            className={`border rounded-lg p-4 cursor-pointer transition-colors ${isDark ? 'border-gray-600 bg-gray-700/30 hover:bg-gray-700/50' : 'border-gray-200 bg-gray-50/50 hover:bg-gray-100'}`}
                                                        >
                                                            <div className="flex flex-wrap items-center gap-2 text-sm mb-2">
                                                                <span className="font-medium text-gray-900">{note.title || 'Untitled'}</span>
                                                                {note.author?.name && <span className="text-gray-500">by {note.author.name}</span>}
                                                                <span className="text-gray-400 text-xs">
                                                                    {note.updatedAt ? new Date(note.updatedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : ''}
                                                                </span>
                                                                <button type="button" onClick={(e) => handleToggleClientNoteActivity(e, note)} className="text-primary-600 text-xs hover:text-primary-700 hover:underline ml-auto">
                                                                    <i className="fas fa-history mr-1"></i>
                                                                    {expandedClientNoteActivityId === note.id ? 'Hide activity' : 'Activity'}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => { e.stopPropagation(); handleDeleteClientNote(note.id); }}
                                                                    disabled={isSavingClientNote}
                                                                    className={`text-xs ${isDark ? 'text-red-400 hover:text-red-300' : 'text-red-600 hover:text-red-700'} disabled:opacity-50`}
                                                                    title="Delete note"
                                                                    aria-label="Delete note"
                                                                >
                                                                    <i className="fas fa-trash mr-1"></i>
                                                                    Delete
                                                                </button>
                                                                <span className="text-primary-600 text-xs">View & edit →</span>
                                                            </div>
                                                            <div className="text-sm text-gray-700 prose prose-sm max-w-none line-clamp-2" dangerouslySetInnerHTML={{ __html: (note.content || '').replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') }} />
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                            {expandedClientNoteActivityId && (
                                                <div className={`w-80 flex-shrink-0 border-l flex flex-col max-h-[60vh] ${isDark ? 'border-gray-600 bg-gray-700/50' : 'border-gray-200 bg-gray-50'}`}>
                                                    <div className={`p-3 border-b flex items-center justify-between ${isDark ? 'border-gray-600' : 'border-gray-200'}`}>
                                                        <h4 className="text-sm font-semibold text-gray-800 truncate">
                                                            {clientNotesList?.find(n => n.id === expandedClientNoteActivityId)?.title || 'Note activity'}
                                                        </h4>
                                                        <button type="button" onClick={(e) => { e.stopPropagation(); setExpandedClientNoteActivityId(null); }} className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded" aria-label="Close activity panel">
                                                            <i className="fas fa-times"></i>
                                                        </button>
                                                    </div>
                                                    <div className="p-3 overflow-y-auto flex-1">
                                                        {(clientNoteActivityByNoteId[expandedClientNoteActivityId] || []).length === 0 ? (
                                                            <p className="text-xs text-gray-500">No activity for this note yet.</p>
                                                        ) : (
                                                            <div className="space-y-2">
                                                                {(clientNoteActivityByNoteId[expandedClientNoteActivityId] || []).map((log) => {
                                                                    const meta = (() => { try { return typeof log.metadata === 'string' ? JSON.parse(log.metadata || '{}') : (log.metadata || {}); } catch (_) { return {}; } })();
                                                                    const dateStr = log.createdAt ? new Date(log.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '';
                                                                    const changes = Array.isArray(meta.changes) ? meta.changes : [];
                                                                    return (
                                                                        <div key={log.id} className={`border rounded-lg p-3 text-xs ${isDark ? 'border-gray-600 bg-gray-800' : 'border-gray-200 bg-white'}`}>
                                                                            <div className="flex flex-wrap items-center gap-2">
                                                                                <span className="px-1.5 py-0.5 rounded bg-gray-200 text-gray-700">{String(log.type || '').replace(/_/g, ' ')}</span>
                                                                                <span className="text-gray-500">{log.userName || 'System'}</span>
                                                                                <span className="text-gray-400">{dateStr}</span>
                                                                            </div>
                                                                            {changes.length > 0 ? (
                                                                                <ul className="mt-2 list-disc list-inside text-gray-600 space-y-0.5">
                                                                                    {changes.map((c, i) => (
                                                                                        <li key={i}>{c}</li>
                                                                                    ))}
                                                                                </ul>
                                                                            ) : log.description ? (
                                                                                <div className="mt-1.5 text-gray-600">{log.description}</div>
                                                                            ) : null}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Proposals — admins manage; circulation assignees can open workflows (e.g. from email deep links) */}
                        {activeTab === 'proposals' && canViewLeadProposals && (
                            <div className="space-y-4">
                                <div className={`rounded-lg p-4 ${isDark ? 'bg-gray-700/50 border border-gray-600' : 'bg-primary-50 border border-primary-100'}`}>
                                    <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                        {canManageLeadProposals ? (
                                            <>
                                                Manage proposals for this lead. Use <strong className="font-medium">Add proposal</strong> to run the full workflow — including creating or linking a customer engagement questionnaire (questionnaires are not created from this tab directly).
                                            </>
                                        ) : (
                                            <>
                                                Open your assigned proposal from the list below to review circulation comments and complete your step. Adding or removing proposals is limited to administrators.
                                            </>
                                        )}
                                    </p>
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <h3 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Proposals</h3>
                                    {canManageLeadProposals ? (
                                        <button
                                            type="button"
                                            disabled={!formData.id}
                                            onClick={openLeadProposalWizardCreate}
                                            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition ${
                                                isDark
                                                    ? 'bg-primary-600 text-white hover:bg-primary-500 disabled:opacity-50'
                                                    : 'bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50'
                                            }`}
                                        >
                                            <i className="fas fa-plus text-xs" aria-hidden />
                                            Add proposal
                                        </button>
                                    ) : null}
                                </div>
                                <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                    Click a proposal to open the guided workflow (questionnaire, draft link, circulation, client submission). Use <strong className="font-medium">Update</strong> at the bottom of this screen to save lead changes.
                                </p>
                                {(!Array.isArray(formData.proposals) || formData.proposals.length === 0) ? (
                                    <div className={`text-center py-12 rounded-lg border border-dashed ${isDark ? 'border-gray-600 text-gray-400' : 'border-gray-200 text-gray-500'}`}>
                                        <i className="fas fa-clipboard-list text-4xl mb-3 opacity-60"></i>
                                        <p className="text-sm">No proposals yet</p>
                                        <p className="text-xs mt-1 mb-4">Add a proposal to create questionnaires and run drafting, circulation, and client submission in one place.</p>
                                        {canManageLeadProposals ? (
                                            <button
                                                type="button"
                                                disabled={!formData.id}
                                                onClick={openLeadProposalWizardCreate}
                                                className={`text-sm font-medium px-4 py-2 rounded-lg ${isDark ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-gray-900 text-white hover:bg-gray-800'} disabled:opacity-50`}
                                            >
                                                Add proposal
                                            </button>
                                        ) : null}
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {formData.proposals.map((proposal, proposalIndex) => {
                                            const qn = getEngagementQuestionnaires();
                                            const w = normalizeLeadProposalWorkflowUi(proposal.workflow);
                                            const linkedQ = w.engagementQuestionnaireId
                                                ? qn.find((q) => String(q.id || '') === String(w.engagementQuestionnaireId))
                                                : null;
                                            const submissionVersionsLinked = linkedQ
                                                ? getEngagementSubmissionVersions(linkedQ)
                                                : [];
                                            const canReviewLinkedQuestionnaireReport =
                                                !!linkedQ &&
                                                (submissionVersionsLinked.some((v) => v.responses || v.submittedAt) ||
                                                    !!(linkedQ.submittedAt || linkedQ.responses));
                                            return (
                                                <div
                                                    key={proposal.id || proposalIndex}
                                                    className={`rounded-xl border overflow-hidden ${isDark ? 'border-gray-600 bg-gray-800/50' : 'border-gray-200 bg-white shadow-sm'}`}
                                                >
                                                    <div
                                                        className={`flex flex-wrap items-stretch justify-between gap-2 ${isDark ? 'bg-gray-900/40' : 'bg-gradient-to-r from-primary-50/90 to-white'}`}
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={() => openLeadProposalWizardEdit(proposalIndex)}
                                                            className={`min-w-0 flex-1 px-4 py-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 ${isDark ? 'focus-visible:ring-offset-gray-900 hover:bg-gray-800/60' : 'focus-visible:ring-offset-white hover:bg-primary-50/80'}`}
                                                            title="Open proposal workflow"
                                                        >
                                                            <div className={`text-sm font-semibold truncate ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                                {proposal.title?.trim() || `Proposal ${proposalIndex + 1}`}
                                                            </div>
                                                            <div className={`text-[11px] mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                                                {linkedQ
                                                                    ? `Questionnaire: ${linkedQ.name || linkedQ.id}`
                                                                    : 'Step 1: link a customer engagement questionnaire'}
                                                                {proposal.workingDocumentLink ? ' · Draft link on file' : ''}
                                                                {String(w.manualEngagementMandateLink || '').trim()
                                                                    ? ' · Manual mandate on file'
                                                                    : ''}
                                                            </div>
                                                            <span
                                                                className={`mt-2 inline-block text-[11px] font-semibold uppercase tracking-wide ${isDark ? 'text-primary-300' : 'text-primary-700'}`}
                                                            >
                                                                Open workflow →
                                                            </span>
                                                        </button>
                                                        <div
                                                            className="flex flex-wrap items-center gap-1.5 shrink-0 border-l px-3 py-2"
                                                            onClick={(e) => e.stopPropagation()}
                                                            onKeyDown={(e) => e.stopPropagation()}
                                                        >
                                                            {canReviewLinkedQuestionnaireReport && linkedQ?.id ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        void handleOpenEngagementReport(String(linkedQ.id))
                                                                    }
                                                                    className={`text-xs px-3 py-1.5 rounded-lg font-medium border ${
                                                                        isDark
                                                                            ? 'border-primary-400 text-primary-200 hover:bg-gray-800'
                                                                            : 'border-primary-500 text-primary-800 hover:bg-primary-50'
                                                                    }`}
                                                                    title="Open the submitted questionnaire report"
                                                                >
                                                                    <i className="fas fa-file-alt mr-1" aria-hidden />
                                                                    Review report
                                                                </button>
                                                            ) : null}
                                                            {canManageLeadProposals ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemoveLeadProposal(proposalIndex)}
                                                                className={`text-xs px-2.5 py-1.5 rounded-lg ${isDark ? 'text-red-300 hover:bg-gray-800' : 'text-red-700 hover:bg-red-50'}`}
                                                            >
                                                                Remove
                                                            </button>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* KYC Tab */}
                        {activeTab === 'kyc' && (
                            <div className="space-y-6">
                                {(() => {
                                    const k = formData.kyc || {};
                                    const le = k.legalEntity || {};
                                    const bp = k.businessProfile || {};
                                    const bd = k.bankingDetails || {};
                                    const updateKyc = (path, value) => {
                                        setFormData(prev => {
                                            const next = { ...prev, kyc: { ...(prev.kyc || {}) } };
                                            if (path.includes('.')) {
                                                const [group, key] = path.split('.');
                                                next.kyc[group] = { ...(next.kyc[group] || {}), [key]: value };
                                            } else {
                                                next.kyc[path] = value;
                                            }
                                            formDataRef.current = next;
                                            return next;
                                        });
                                    };
                                    const clientTypes = ['Individual', 'Company', 'Close Corporation', 'Trust', 'Government / State-Owned Entity'];
                                    const inputCls = `w-full px-3 py-2 text-sm rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400' : 'border border-gray-300'}`;
                                    const labelCls = `block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`;
                                    const sectionCls = `rounded-lg p-4 ${isDark ? 'bg-gray-700/50 border border-gray-600' : 'bg-gray-50 border border-gray-200'}`;
                                    const headingCls = `text-sm font-semibold mb-2 ${isDark ? 'text-gray-200' : 'text-gray-800'}`;
                                    const subheadingCls = `text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`;
                                    const helperCls = `text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`;
                                    const helperClsAlt = `text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`;
                                    return (
                                        <>
                                            {/* SECTION 1 – CLIENT TYPE */}
                                            <section className={sectionCls}>
                                                <h3 className={headingCls}>SECTION 1 – CLIENT TYPE</h3>
                                                <div className={`border-b mb-3 ${isDark ? 'border-gray-600' : 'border-gray-200'}`}></div>
                                                <div className="flex flex-wrap gap-x-12 gap-y-4">
                                                    {clientTypes.map(opt => (
                                                        <label key={opt} className={`inline-flex items-center gap-1.5 cursor-pointer ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                            <input
                                                                type="radio"
                                                                name="kyc_clientType"
                                                                checked={(k.clientType || '') === opt}
                                                                onChange={() => updateKyc('clientType', opt)}
                                                                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 shrink-0"
                                                            />
                                                            <span className="text-sm whitespace-nowrap">{opt}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </section>

                                            {/* SECTION 2 – CLIENT IDENTIFICATION */}
                                            <section className={sectionCls}>
                                                <h3 className={headingCls}>SECTION 2 – CLIENT IDENTIFICATION</h3>
                                                <div className={`border-b mb-3 ${isDark ? 'border-gray-600' : 'border-gray-200'}`}></div>
                                                <h4 className={subheadingCls}>2.1 Legal Entity Details</h4>
                                                <div className={`grid gap-3 ${isFullPage ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
                                                    {[
                                                        { key: 'registeredLegalName', label: 'Registered Legal Name' },
                                                        { key: 'tradingName', label: 'Trading Name (if different)' },
                                                        { key: 'registrationNumber', label: 'Registration Number' },
                                                        { key: 'vatNumber', label: 'VAT Number (if applicable)' },
                                                        { key: 'incomeTaxNumber', label: 'Income Tax Number' },
                                                        { key: 'registeredAddress', label: 'Registered Address' },
                                                        { key: 'principalPlaceOfBusiness', label: 'Principal Place of Business' },
                                                        { key: 'countryOfIncorporation', label: 'Country of Incorporation' }
                                                    ].map(({ key, label }) => (
                                                        <div key={key}>
                                                            <label className={labelCls}>{label}</label>
                                                            <input type="text" value={le[key] || ''} onChange={e => updateKyc('legalEntity.' + key, e.target.value)} className={inputCls} />
                                                        </div>
                                                    ))}
                                                </div>
                                                <p className={`mt-3 ${helperCls}`}>2.2 Directors / Members / Trustees (attach schedule if more than 3)</p>
                                                <p className={`mb-2 ${helperClsAlt}`}>For each: Full name, ID/Passport number, Nationality, Position/capacity, % Interest, Certified copy of ID/Passport, Proof of residential address (not older than 3 months)</p>
                                                <textarea className={inputCls} rows={3} placeholder="List or describe directors/members/trustees…" value={k.directorsNotes || ''} onChange={e => setFormData(prev => { const n = { ...prev, kyc: { ...(prev.kyc || {}), directorsNotes: e.target.value } }; formDataRef.current = n; return n; })} />
                                            </section>

                                            {/* SECTION 3 – BENEFICIAL OWNERSHIP */}
                                            <section className={sectionCls}>
                                                <h3 className={headingCls}>SECTION 3 – BENEFICIAL OWNERSHIP</h3>
                                                <div className={`border-b mb-3 ${isDark ? 'border-gray-600' : 'border-gray-200'}`}></div>
                                                <p className={`mb-2 ${helperClsAlt}`}>3.1 Ultimate Beneficial Owner(s) (UBOs) – Any natural person owning or controlling 25% or more, or exercising effective control. For each: Full name, ID/Passport number, Country of residence, Nature of control, % Ownership or control, Certified copy of ID/Passport, Proof of residential address (not older than 3 months)</p>
                                                <textarea className={inputCls} rows={3} placeholder="List UBOs…" value={k.ubosNotes || ''} onChange={e => setFormData(prev => { const n = { ...prev, kyc: { ...(prev.kyc || {}), ubosNotes: e.target.value } }; formDataRef.current = n; return n; })} />
                                            </section>

                                            {/* SECTION 4 – BUSINESS PROFILE */}
                                            <section className={sectionCls}>
                                                <h3 className={headingCls}>SECTION 4 – BUSINESS PROFILE</h3>
                                                <div className={`border-b mb-3 ${isDark ? 'border-gray-600' : 'border-gray-200'}`}></div>
                                                <h4 className={subheadingCls}>4.1 Nature of Business</h4>
                                                <div className={`grid gap-3 ${isFullPage ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
                                                    <div>
                                                        <label className={labelCls}>Industry sector (e.g. Mining, Forestry, Agriculture, Logistics, Other)</label>
                                                        <input type="text" value={bp.industrySector || ''} onChange={e => updateKyc('businessProfile.industrySector', e.target.value)} className={inputCls} />
                                                    </div>
                                                    <div>
                                                        <label className={labelCls}>Core business activities</label>
                                                        <input type="text" value={bp.coreBusinessActivities || ''} onChange={e => updateKyc('businessProfile.coreBusinessActivities', e.target.value)} className={inputCls} />
                                                    </div>
                                                    <div>
                                                        <label className={labelCls}>Primary operating locations</label>
                                                        <input type="text" value={bp.primaryOperatingLocations || ''} onChange={e => updateKyc('businessProfile.primaryOperatingLocations', e.target.value)} className={inputCls} />
                                                    </div>
                                                    <div>
                                                        <label className={labelCls}>Years in operation</label>
                                                        <input type="text" value={bp.yearsInOperation || ''} onChange={e => updateKyc('businessProfile.yearsInOperation', e.target.value)} className={inputCls} />
                                                    </div>
                                                </div>
                                            </section>

                                            {/* SECTION 5 – BANKING DETAILS */}
                                            <section className={sectionCls}>
                                                <h3 className={headingCls}>SECTION 5 – BANKING DETAILS</h3>
                                                <div className={`border-b mb-3 ${isDark ? 'border-gray-600' : 'border-gray-200'}`}></div>
                                                <h4 className={subheadingCls}>5.1 Banking Details</h4>
                                                <div className={`grid gap-3 ${isFullPage ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
                                                    {[
                                                        { key: 'bankName', label: 'Bank name' },
                                                        { key: 'accountHolderName', label: 'Account holder name' },
                                                        { key: 'accountNumber', label: 'Account number' },
                                                        { key: 'branchCode', label: 'Branch code' },
                                                        { key: 'accountType', label: 'Account type' }
                                                    ].map(({ key, label }) => (
                                                        <div key={key}>
                                                            <label className={labelCls}>{label}</label>
                                                            <input type="text" value={bd[key] || ''} onChange={e => updateKyc('bankingDetails.' + key, e.target.value)} className={inputCls} />
                                                        </div>
                                                    ))}
                                                </div>
                                            </section>
                                        </>
                                    );
                                })()}
                            </div>
                        )}

                        {/* Footer Actions */}
                        <div className="flex justify-between items-center pt-4 border-t border-gray-200">
                            <div>
                                {/* Convert to Client button - only show for leads */}
                                {isLead && onConvertToClient && client && (
                                    <button 
                                        type="button" 
                                        onClick={async () => {
                                            const formData = formDataRef.current || null;
                                            const resolvedId = client?.id || formData?.id || null;
                                            if (!resolvedId) {
                                                alert('Cannot convert lead: missing lead identifier.');
                                                return;
                                            }
                                            const dataToConvert = {
                                                ...(client || {}),
                                                ...(formData || {}),
                                                id: String(resolvedId)
                                            };
                                            try {
                                                // Parent (e.g. Clients.jsx) performs PATCH + SPA navigation — no full page reload.
                                                await Promise.resolve(onConvertToClient(dataToConvert));
                                            } catch (error) {
                                                alert(`Failed to convert lead to client: ${error?.message || 'Unknown error'}`);
                                            }
                                        }}
                                        className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center gap-2"
                                    >
                                        <i className="fas fa-exchange-alt"></i>
                                        Convert to Client
                                    </button>
                                )}
                                {!isLead && canManageLeadClientConversion && onRevertToLead && client && (() => {
                                    const log = client.activityLog || (client.activityLogJsonb ?? []);
                                    const arr = Array.isArray(log) ? log : (typeof log === 'string' && log.trim() ? (() => { try { return JSON.parse(log); } catch (_) { return []; } })() : []);
                                    const wasConvertedFromLead = arr.some(e => e && e.type === 'Lead Converted');
                                    return wasConvertedFromLead ? (
                                        <button 
                                            type="button" 
                                            onClick={async () => {
                                                if (!onRevertToLead) return;
                                                const formData = formDataRef.current || null;
                                                const resolvedId = client?.id || formData?.id || null;
                                                if (!resolvedId) {
                                                    alert('Cannot revert client: missing client identifier.');
                                                    return;
                                                }
                                                const dataToRevert = {
                                                    ...(client || {}),
                                                    ...(formData || {}),
                                                    id: String(resolvedId)
                                                };
                                                await Promise.resolve(onRevertToLead(dataToRevert));
                                            }}
                                            className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium flex items-center gap-2"
                                        >
                                            <i className="fas fa-undo"></i>
                                            Revert to Lead
                                        </button>
                                    ) : null;
                                })()}
                            </div>
                            <div className="flex gap-3">
                                <button 
                                    type="button" 
                                    onClick={handleClose} 
                                    className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    disabled={isSubmitting}
                                    className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium disabled:opacity-70 disabled:cursor-not-allowed"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <i className="fas fa-spinner fa-spin mr-1.5"></i>
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <i className="fas fa-save mr-1.5"></i>
                                            {client ? `Update ${entityLabel}` : `Add ${entityLabel}`}
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
            
            {/* Add External Agent Modal - Admin Only */}
            {showExternalAgentModal && (
                <div 
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]"
                    onClick={() => {
                        setShowExternalAgentModal(false);
                        setNewExternalAgentName('');
                    }}
                >
                    <div 
                        className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-gray-200">
                            <h2 className="text-xl font-semibold text-gray-900">Add New External Agent</h2>
                        </div>
                        
                        {/* Body */}
                        <div className="p-6">
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    External Agent Name *
                                </label>
                                <input
                                    type="text"
                                    value={newExternalAgentName}
                                    onChange={(e) => setNewExternalAgentName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !isCreatingExternalAgent) {
                                            handleCreateExternalAgent();
                                        } else if (e.key === 'Escape') {
                                            setShowExternalAgentModal(false);
                                            setNewExternalAgentName('');
                                        }
                                    }}
                                    placeholder="Enter external agent name"
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    autoFocus
                                />
                            </div>
                            <p className="text-xs text-gray-500 mb-4">
                                Only administrators can create new external agents.
                            </p>
                        </div>
                        
                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                            <button
                                onClick={() => {
                                    setShowExternalAgentModal(false);
                                    setNewExternalAgentName('');
                                }}
                                className="px-4 py-2 rounded-lg transition-colors bg-gray-100 hover:bg-gray-200 text-gray-700"
                                disabled={isCreatingExternalAgent}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateExternalAgent}
                                disabled={!newExternalAgentName.trim() || isCreatingExternalAgent}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isCreatingExternalAgent ? (
                                    <>
                                        <i className="fas fa-spinner fa-spin mr-2"></i>
                                        Creating...
                                    </>
                                ) : (
                                    <>
                                        <i className="fas fa-plus mr-2"></i>
                                        Create Agent
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showLeadProposalWizard && leadProposalWizardDraft ? (() => {
                /** Full-page CRM: overlay only this detail panel so MainLayout sidebar/header stay visible. */
                const embedProposalWizardInLayout = Boolean(isFullPage);
                const leadProposalWizardOverlay = (
                    <div
                        className={
                            embedProposalWizardInLayout
                                ? 'absolute inset-0 z-[10050] flex min-h-0 flex-col overflow-hidden'
                                : 'fixed inset-0 z-[10050] flex min-h-0 flex-col overflow-hidden bg-black/35'
                        }
                        role="presentation"
                    >
                        <div
                            className={`flex min-h-0 w-full max-w-none flex-1 flex-col overflow-hidden rounded-none shadow-none [zoom:0.78] ${
                                embedProposalWizardInLayout ? 'h-full' : 'h-[100dvh]'
                            } ${isDark ? 'bg-gray-800 text-gray-100' : 'bg-white text-gray-900'}`}
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="lead-proposal-wizard-title"
                        >
                        <div className={`shrink-0 border-b px-6 py-5 sm:px-8 sm:py-6 ${isDark ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gradient-to-r from-primary-50/80 to-white'}`}>
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h2 id="lead-proposal-wizard-title" className="text-2xl md:text-3xl font-bold tracking-tight">
                                        {leadProposalWizardEditIndex != null ? 'Edit proposal process' : 'Add proposal'}
                                    </h2>
                                    <p className={`mt-2 text-sm md:text-base leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                        Work through the four standard stages. You can save anytime — data syncs with this lead.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    className={`rounded-lg p-2 shrink-0 ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
                                    onClick={() => !leadProposalWizardSaving && closeLeadProposalWizard()}
                                    aria-label="Close"
                                >
                                    <i className="fas fa-times" />
                                </button>
                            </div>
                            <div className="mt-3">
                                <label className={`block text-xs md:text-sm font-semibold uppercase tracking-wide mb-1.5 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                    Proposal title
                                </label>
                                <input
                                    type="text"
                                    value={leadProposalWizardDraft.title || ''}
                                    onChange={(e) =>
                                        setLeadProposalWizardDraft((p) => (p ? { ...p, title: e.target.value } : p))
                                    }
                                    className={`w-full rounded-lg border px-4 py-3 text-base md:text-lg ${isDark ? 'border-gray-600 bg-gray-900 text-gray-100' : 'border-gray-300'}`}
                                    placeholder="e.g. Opencast fuel management — Q3 proposal"
                                />
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                                {LEAD_PROPOSAL_PROCESS_STEPS.map((s) => {
                                    const active = leadProposalWizardStep === s.step;
                                    return (
                                        <button
                                            key={s.step}
                                            type="button"
                                            onClick={() => goLeadProposalWizardStep(s.step)}
                                            className={`rounded-full px-4 py-2.5 text-sm md:text-base font-semibold transition ${
                                                active
                                                    ? isDark
                                                        ? 'bg-primary-600 text-white'
                                                        : 'bg-primary-600 text-white shadow'
                                                    : isDark
                                                      ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                            }`}
                                        >
                                            <span className="opacity-80 mr-1">{s.step}.</span>
                                            {s.label.length > 48 ? `${s.label.slice(0, 46)}…` : s.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 sm:px-8 sm:py-6">
                            {leadProposalWizardHint ? (
                                <div
                                    className={`mb-4 rounded-lg border px-4 py-3 text-sm md:text-base ${isDark ? 'border-amber-700/50 bg-amber-900/20 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
                                >
                                    {leadProposalWizardHint}
                                </div>
                            ) : null}
                            {(() => {
                                const d = leadProposalWizardDraft;
                                const w = normalizeLeadProposalWorkflowUi(d.workflow);
                                const qn = getEngagementQuestionnaires();
                                const stepPanelCls = `rounded-xl border p-6 sm:p-8 ${isDark ? 'border-gray-700 bg-gray-900/40' : 'border-gray-200 bg-gray-50/80'} text-base`;
                                const wizStepTitleCls = `text-lg md:text-xl font-bold mb-2 ${isDark ? 'text-gray-100' : 'text-gray-900'}`;
                                const wizDescCls = `text-sm md:text-base mb-5 leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-600'}`;
                                const labelCls = `block text-sm md:text-base font-semibold mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`;
                                const inputCls = `w-full rounded-lg border px-4 py-3 text-base md:text-lg ${isDark ? 'border-gray-600 bg-gray-900 text-gray-100' : 'border-gray-300 bg-white'}`;

                                if (leadProposalWizardStep === 1) {
                                    const isProposalEdit = leadProposalWizardEditIndex != null;
                                    const qid = String(w.engagementQuestionnaireId || '').trim();
                                    const creatingQ = leadProposalWizardCreatingQ;
                                    const selectedQ = qid
                                        ? qn.find((q) => String(q.id || '') === qid)
                                        : null;
                                    const submissionVersionsForQ = selectedQ ? getEngagementSubmissionVersions(selectedQ) : [];
                                    const canViewSubmissionReport =
                                        !!selectedQ &&
                                        (submissionVersionsForQ.some((v) => v.responses || v.submittedAt) ||
                                            !!(selectedQ.submittedAt || selectedQ.responses));
                                    const mandateLinkRaw = String(w.manualEngagementMandateLink || '').trim();
                                    const mandateCls = classifyProposalWorkingDocument(mandateLinkRaw);
                                    const mandateDisplayName =
                                        w.manualEngagementMandateUploadedName ||
                                        (mandateCls.kind === 'upload' ? proposalWorkingDocBasename(mandateLinkRaw) : '');
                                    const mandateIconMeta = proposalDocIconMeta(
                                        w.manualEngagementMandateUploadedName || mandateDisplayName || mandateLinkRaw
                                    );
                                    const mandateAbsOpen = toAbsoluteProposalDocUrl(mandateLinkRaw);
                                    const mandateShowUploadCard = Boolean(mandateLinkRaw && mandateCls.kind === 'upload');
                                    const mandateShowCloudCard = Boolean(
                                        mandateLinkRaw && (mandateCls.kind === 'cloud' || mandateCls.kind === 'link')
                                    );
                                    const mandateHideUrlInField = mandateShowUploadCard || mandateShowCloudCard;
                                    return (
                                        <div className={stepPanelCls}>
                                            <h3 className={wizStepTitleCls}>
                                                Step 1 — Customer engagement mandate
                                            </h3>
                                            <p className={wizDescCls}>
                                                Each proposal uses its own questionnaire. A new one is created automatically when you add a proposal — you do not pick from other questionnaires. Multiple proposals means multiple questionnaires on this lead. If the mandate was completed offline, attach the Word or PDF file below (optional — you can use this instead of or alongside the online questionnaire).
                                            </p>
                                            {creatingQ ? (
                                                <div className={`flex items-center justify-center gap-2 py-10 text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                                                    <i className="fas fa-spinner fa-spin" aria-hidden />
                                                    Creating customer engagement questionnaire…
                                                </div>
                                            ) : null}
                                            {!creatingQ && qid && selectedQ ? (
                                                <>
                                                    {canViewSubmissionReport ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => void handleOpenEngagementReport(String(selectedQ.id || ''))}
                                                            className={`mb-3 w-full rounded-lg border px-3 py-2.5 text-left transition ring-offset-2 ring-offset-transparent hover:ring-2 hover:ring-primary-500/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                                                                isDark ? 'border-gray-600 bg-gray-900/60' : 'border-gray-200 bg-white'
                                                            }`}
                                                            title="Open the submitted questionnaire report"
                                                        >
                                                            <div
                                                                className={`text-[11px] uppercase tracking-wide font-semibold ${isDark ? 'text-gray-500' : 'text-gray-500'}`}
                                                            >
                                                                This proposal&apos;s questionnaire
                                                            </div>
                                                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                                                <span
                                                                    className={`text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}
                                                                >
                                                                    {selectedQ.name || 'Customer engagement questionnaire'}
                                                                </span>
                                                                <span
                                                                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${isDark ? 'bg-primary-900/80 text-primary-200' : 'bg-primary-100 text-primary-800'}`}
                                                                >
                                                                    Report submitted — click to review
                                                                </span>
                                                            </div>
                                                        </button>
                                                    ) : (
                                                        <div
                                                            className={`mb-3 rounded-lg border px-3 py-2.5 ${isDark ? 'border-gray-600 bg-gray-900/60' : 'border-gray-200 bg-white'}`}
                                                        >
                                                            <div
                                                                className={`text-[11px] uppercase tracking-wide font-semibold ${isDark ? 'text-gray-500' : 'text-gray-500'}`}
                                                            >
                                                                This proposal&apos;s questionnaire
                                                            </div>
                                                            <div
                                                                className={`mt-1 text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}
                                                            >
                                                                {selectedQ.name || 'Customer engagement questionnaire'}
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div className="flex flex-wrap gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedEngagementQuestionnaireId(selectedQ.id || '');
                                                                openEngagementPrefillModal(false, selectedQ);
                                                            }}
                                                            className={`text-xs font-semibold px-4 py-2.5 rounded-lg ${isDark ? 'bg-primary-700 hover:bg-primary-600' : 'bg-primary-600 text-white hover:bg-primary-700'}`}
                                                        >
                                                            Open questionnaire editor
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => void handleOpenEngagementReport(String(selectedQ.id || ''))}
                                                            className={`text-xs font-semibold px-4 py-2.5 rounded-lg border ${isDark ? 'border-gray-500 text-gray-200 hover:bg-gray-700' : 'border-gray-300 text-gray-800 hover:bg-gray-50'}`}
                                                            title="Fetches the latest submission from the server (use after the client submits the public form)."
                                                        >
                                                            Review submission report
                                                        </button>
                                                    </div>
                                                    <p className={`mt-3 text-[11px] ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>
                                                        {canViewSubmissionReport
                                                            ? 'Submission on file — open the report above or click the questionnaire card.'
                                                            : selectedQ.linkActive
                                                              ? 'Share link is active — open the editor to copy the URL (remembered in this session) or regenerate. After the client submits, use Review submission report.'
                                                              : 'Open the editor to generate and share the link.'}
                                                    </p>
                                                </>
                                            ) : null}
                                            {!creatingQ && qid && !selectedQ ? (
                                                <div className="space-y-2">
                                                    <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                                        Questionnaire <span className="font-mono text-[11px]">{qid}</span> is linked; refresh if the list hasn&apos;t updated yet.
                                                    </p>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedEngagementQuestionnaireId(qid);
                                                            openEngagementPrefillModal(false, { id: qid, name: '' });
                                                        }}
                                                        className={`text-xs font-semibold px-4 py-2.5 rounded-lg ${isDark ? 'bg-primary-700 hover:bg-primary-600' : 'bg-primary-600 text-white hover:bg-primary-700'}`}
                                                    >
                                                        Open questionnaire editor
                                                    </button>
                                                </div>
                                            ) : null}
                                            {!creatingQ && !qid && isProposalEdit ? (
                                                <button
                                                    type="button"
                                                    disabled={leadProposalWizardCreatingQ}
                                                    onClick={() => {
                                                        void (async () => {
                                                            setLeadProposalWizardCreatingQ(true);
                                                            setLeadProposalWizardHint('');
                                                            try {
                                                                const newId = await createFreshQuestionnaireForProposal(
                                                                    d.title || ''
                                                                );
                                                                updateLeadProposalWizardWorkflow({
                                                                    engagementQuestionnaireId: newId
                                                                });
                                                                setSelectedEngagementQuestionnaireId(newId);
                                                            } catch (err) {
                                                                setLeadProposalWizardHint(
                                                                    err.message || 'Could not create questionnaire.'
                                                                );
                                                            } finally {
                                                                setLeadProposalWizardCreatingQ(false);
                                                            }
                                                        })();
                                                    }}
                                                    className={`text-xs font-semibold px-4 py-2.5 rounded-lg ${isDark ? 'bg-primary-700 hover:bg-primary-600 text-white' : 'bg-primary-600 hover:bg-primary-700 text-white'}`}
                                                >
                                                    Create engagement questionnaire for this proposal
                                                </button>
                                            ) : null}
                                            {!creatingQ && !qid && !isProposalEdit ? (
                                                <div className={`rounded-lg border px-3 py-3 text-xs ${isDark ? 'border-amber-800/60 bg-amber-950/30 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
                                                    <p className="font-medium mb-2">Questionnaire wasn&apos;t created.</p>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            leadProposalWizardSessionDraftIdRef.current = d.id || null;
                                                            void (async () => {
                                                                setLeadProposalWizardCreatingQ(true);
                                                                setLeadProposalWizardHint('');
                                                                try {
                                                                    const newId = await createFreshQuestionnaireForProposal(
                                                                        d.title || ''
                                                                    );
                                                                    setLeadProposalWizardDraft((prev) => {
                                                                        if (!prev || prev.id !== d.id) return prev;
                                                                        const wf = normalizeLeadProposalWorkflowUi(prev.workflow);
                                                                        return {
                                                                            ...prev,
                                                                            workflow: {
                                                                                ...wf,
                                                                                engagementQuestionnaireId: newId
                                                                            }
                                                                        };
                                                                    });
                                                                    setSelectedEngagementQuestionnaireId(newId);
                                                                } catch (err) {
                                                                    setLeadProposalWizardHint(
                                                                        err.message || 'Could not create questionnaire.'
                                                                    );
                                                                } finally {
                                                                    setLeadProposalWizardCreatingQ(false);
                                                                }
                                                            })();
                                                        }}
                                                        className={`font-semibold underline ${isDark ? 'text-amber-100' : 'text-amber-900'}`}
                                                    >
                                                        Try creating again
                                                    </button>
                                                </div>
                                            ) : null}
                                            {!creatingQ ? (
                                                <div
                                                    className={`mt-8 border-t pt-6 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}
                                                >
                                                    <h4
                                                        className={`text-base md:text-lg font-bold mb-1 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}
                                                    >
                                                        Manual mandate document (Word / PDF)
                                                    </h4>
                                                    <p className={`text-sm md:text-base mb-4 leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                                        Upload a filled mandate from Word or attach a cloud link. Saved with this proposal when you use{' '}
                                                        <strong className="font-semibold">Save &amp; close</strong>.
                                                    </p>

                                                    {mandateShowUploadCard ? (
                                                        <div
                                                            className={`mb-6 flex flex-wrap items-center gap-5 rounded-xl border p-5 sm:p-6 ${isDark ? 'border-gray-600 bg-gray-900/70' : 'border-gray-200 bg-white'}`}
                                                        >
                                                            <div
                                                                className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-xl ${mandateIconMeta.bg}`}
                                                                aria-hidden
                                                            >
                                                                <i className={`fas ${mandateIconMeta.icon} text-3xl ${mandateIconMeta.color}`} />
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <div
                                                                    className={`truncate text-base font-semibold md:text-lg ${isDark ? 'text-gray-100' : 'text-gray-900'}`}
                                                                    title={mandateDisplayName || undefined}
                                                                >
                                                                    {mandateDisplayName || proposalWorkingDocBasename(mandateLinkRaw)}
                                                                </div>
                                                                <p className={`mt-1 text-sm ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>
                                                                    Uploaded mandate (stored on your server)
                                                                </p>
                                                                <div className="mt-3 flex flex-wrap items-center gap-4">
                                                                    <a
                                                                        href={mandateAbsOpen}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className={`inline-flex items-center gap-2 text-base font-semibold ${isDark ? 'text-primary-400 hover:text-primary-300' : 'text-primary-700 hover:text-primary-800'}`}
                                                                    >
                                                                        <i className="fas fa-external-link-alt text-sm" aria-hidden />
                                                                        Open file
                                                                    </a>
                                                                    <button
                                                                        type="button"
                                                                        className={`text-sm font-semibold underline ${isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-600 hover:text-gray-900'}`}
                                                                        onClick={() =>
                                                                            setLeadProposalWizardDraft((p) => {
                                                                                if (!p) return p;
                                                                                const wf = normalizeLeadProposalWorkflowUi(p.workflow);
                                                                                return {
                                                                                    ...p,
                                                                                    workflow: {
                                                                                        ...wf,
                                                                                        manualEngagementMandateLink: '',
                                                                                        manualEngagementMandateUploadedName: ''
                                                                                    }
                                                                                };
                                                                            })
                                                                        }
                                                                    >
                                                                        Remove file
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : null}

                                                    {mandateShowCloudCard ? (
                                                        <div
                                                            className={`mb-6 rounded-xl border p-5 sm:p-6 ${isDark ? 'border-gray-600 bg-gray-900/70' : 'border-gray-200 bg-white'}`}
                                                        >
                                                            <div
                                                                className={`mb-2 text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-gray-500' : 'text-gray-500'}`}
                                                            >
                                                                Mandate link (cloud / SharePoint / etc.)
                                                            </div>
                                                            <a
                                                                href={mandateAbsOpen}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className={`inline-flex flex-wrap items-center gap-2 break-all text-base font-medium underline md:text-lg ${isDark ? 'text-primary-400 hover:text-primary-300' : 'text-primary-700 hover:text-primary-800'}`}
                                                            >
                                                                <i className="fas fa-link shrink-0" aria-hidden />
                                                                {mandateCls.kind === 'cloud' || mandateCls.kind === 'link'
                                                                    ? shortCloudLinkLabel(mandateAbsOpen)
                                                                    : mandateLinkRaw}
                                                            </a>
                                                            <p className={`mt-2 text-sm ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>
                                                                Opens in a new tab
                                                            </p>
                                                            <button
                                                                type="button"
                                                                className={`mt-3 text-sm font-semibold underline ${isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-600 hover:text-gray-900'}`}
                                                                onClick={() =>
                                                                    setLeadProposalWizardDraft((p) => {
                                                                        if (!p) return p;
                                                                        const wf = normalizeLeadProposalWorkflowUi(p.workflow);
                                                                        return {
                                                                            ...p,
                                                                            workflow: {
                                                                                ...wf,
                                                                                manualEngagementMandateLink: '',
                                                                                manualEngagementMandateUploadedName: ''
                                                                            }
                                                                        };
                                                                    })
                                                                }
                                                            >
                                                                Clear link
                                                            </button>
                                                        </div>
                                                    ) : null}

                                                    <label className={labelCls}>
                                                        {mandateShowUploadCard
                                                            ? 'Replace with a cloud link'
                                                            : mandateShowCloudCard
                                                              ? 'Replace link'
                                                              : 'Link to mandate document'}
                                                    </label>
                                                    <input
                                                        type="url"
                                                        value={mandateHideUrlInField ? '' : mandateLinkRaw}
                                                        onChange={(e) => {
                                                            const v = e.target.value;
                                                            setLeadProposalWizardDraft((p) => {
                                                                if (!p) return p;
                                                                const wf = normalizeLeadProposalWorkflowUi(p.workflow);
                                                                return {
                                                                    ...p,
                                                                    workflow: {
                                                                        ...wf,
                                                                        manualEngagementMandateLink: v,
                                                                        manualEngagementMandateUploadedName: ''
                                                                    }
                                                                };
                                                            });
                                                        }}
                                                        className={inputCls}
                                                        placeholder={
                                                            mandateShowUploadCard
                                                                ? 'Paste SharePoint, Google Drive, or other https link…'
                                                                : mandateShowCloudCard
                                                                  ? 'Paste a different https link…'
                                                                  : 'https://…'
                                                        }
                                                    />

                                                    <label className={`${labelCls} mt-6`}>Upload mandate file</label>
                                                    <input
                                                        type="file"
                                                        accept=".doc,.docx,.pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
                                                        disabled={leadProposalMandateUploadBusy}
                                                        onChange={(e) => {
                                                            const f = e.target.files?.[0];
                                                            e.target.value = '';
                                                            if (f) void uploadLeadProposalManualMandateFile(f);
                                                        }}
                                                        className={`text-base w-full ${isDark ? 'text-gray-300' : 'text-gray-700'}`}
                                                    />
                                                    {leadProposalMandateUploadBusy ? (
                                                        <p className="mt-3 text-base text-primary-600">
                                                            <i className="fas fa-spinner fa-spin mr-2" aria-hidden />
                                                            Uploading…
                                                        </p>
                                                    ) : null}
                                                </div>
                                            ) : null}
                                        </div>
                                    );
                                }
                                if (leadProposalWizardStep === 2) {
                                    const linkRaw = String(d.workingDocumentLink || '').trim();
                                    const cls = classifyProposalWorkingDocument(linkRaw);
                                    const displayName =
                                        w.workingDraftUploadedName ||
                                        (cls.kind === 'upload' ? proposalWorkingDocBasename(linkRaw) : '');
                                    const iconMeta = proposalDocIconMeta(w.workingDraftUploadedName || displayName || linkRaw);
                                    const absOpen = toAbsoluteProposalDocUrl(linkRaw);
                                    const showUploadCard = Boolean(linkRaw && cls.kind === 'upload');
                                    const showCloudCard = Boolean(
                                        linkRaw && (cls.kind === 'cloud' || cls.kind === 'link')
                                    );
                                    const hideUrlInField = showUploadCard || showCloudCard;
                                    return (
                                        <div className={stepPanelCls}>
                                            <h3 className={wizStepTitleCls}>Step 2 — Proposal drafting</h3>
                                            <p className={wizDescCls}>
                                                Paste a link to the working draft (SharePoint, Google Docs, etc.) or upload a file — the URL is stored on the proposal.
                                            </p>

                                            {showUploadCard ? (
                                                <div
                                                    className={`mb-6 flex flex-wrap items-center gap-5 rounded-xl border p-5 sm:p-6 ${isDark ? 'border-gray-600 bg-gray-900/70' : 'border-gray-200 bg-white'}`}
                                                >
                                                    <div
                                                        className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-xl ${iconMeta.bg}`}
                                                        aria-hidden
                                                    >
                                                        <i className={`fas ${iconMeta.icon} text-3xl ${iconMeta.color}`} />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div
                                                            className={`truncate text-base font-semibold md:text-lg ${isDark ? 'text-gray-100' : 'text-gray-900'}`}
                                                            title={displayName || undefined}
                                                        >
                                                            {displayName || proposalWorkingDocBasename(linkRaw)}
                                                        </div>
                                                        <p className={`mt-1 text-sm ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>
                                                            Uploaded file (stored on your server)
                                                        </p>
                                                        <div className="mt-3 flex flex-wrap items-center gap-4">
                                                            <a
                                                                href={absOpen}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className={`inline-flex items-center gap-2 text-base font-semibold ${isDark ? 'text-primary-400 hover:text-primary-300' : 'text-primary-700 hover:text-primary-800'}`}
                                                            >
                                                                <i className="fas fa-external-link-alt text-sm" aria-hidden />
                                                                Open file
                                                            </a>
                                                            <button
                                                                type="button"
                                                                className={`text-sm font-semibold underline ${isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-600 hover:text-gray-900'}`}
                                                                onClick={() =>
                                                                    setLeadProposalWizardDraft((p) => {
                                                                        if (!p) return p;
                                                                        const wf = normalizeLeadProposalWorkflowUi(p.workflow);
                                                                        return {
                                                                            ...p,
                                                                            workingDocumentLink: '',
                                                                            workflow: {
                                                                                ...wf,
                                                                                workingDraftUploadedName: ''
                                                                            }
                                                                        };
                                                                    })
                                                                }
                                                            >
                                                                Remove file
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : null}

                                            {showCloudCard ? (
                                                <div
                                                    className={`mb-6 rounded-xl border p-5 sm:p-6 ${isDark ? 'border-gray-600 bg-gray-900/70' : 'border-gray-200 bg-white'}`}
                                                >
                                                    <div
                                                        className={`mb-2 text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-gray-500' : 'text-gray-500'}`}
                                                    >
                                                        Cloud / external link
                                                    </div>
                                                    <a
                                                        href={absOpen}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className={`inline-flex flex-wrap items-center gap-2 break-all text-base font-medium underline md:text-lg ${isDark ? 'text-primary-400 hover:text-primary-300' : 'text-primary-700 hover:text-primary-800'}`}
                                                    >
                                                        <i className="fas fa-link shrink-0" aria-hidden />
                                                        {cls.kind === 'cloud' || cls.kind === 'link'
                                                            ? shortCloudLinkLabel(absOpen)
                                                            : linkRaw}
                                                    </a>
                                                    <p className={`mt-2 text-sm ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>
                                                        Opens in a new tab
                                                    </p>
                                                    <button
                                                        type="button"
                                                        className={`mt-3 text-sm font-semibold underline ${isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-600 hover:text-gray-900'}`}
                                                        onClick={() =>
                                                            setLeadProposalWizardDraft((p) => {
                                                                if (!p) return p;
                                                                const wf = normalizeLeadProposalWorkflowUi(p.workflow);
                                                                return {
                                                                    ...p,
                                                                    workingDocumentLink: '',
                                                                    workflow: {
                                                                        ...wf,
                                                                        workingDraftUploadedName: ''
                                                                    }
                                                                };
                                                            })
                                                        }
                                                    >
                                                        Clear link
                                                    </button>
                                                </div>
                                            ) : null}

                                            <label className={labelCls}>
                                                {showUploadCard
                                                    ? 'Replace with a cloud link'
                                                    : showCloudCard
                                                      ? 'Replace link'
                                                      : 'Working document link'}
                                            </label>
                                            <input
                                                type="url"
                                                value={hideUrlInField ? '' : d.workingDocumentLink || ''}
                                                onChange={(e) => {
                                                    const v = e.target.value;
                                                    setLeadProposalWizardDraft((p) => {
                                                        if (!p) return p;
                                                        const wf = normalizeLeadProposalWorkflowUi(p.workflow);
                                                        return {
                                                            ...p,
                                                            workingDocumentLink: v,
                                                            workflow: { ...wf, workingDraftUploadedName: '' }
                                                        };
                                                    });
                                                }}
                                                className={inputCls}
                                                placeholder={
                                                    showUploadCard
                                                        ? 'Paste Google Drive, SharePoint, or other https link…'
                                                        : showCloudCard
                                                          ? 'Paste a different https link…'
                                                          : 'https://…'
                                                }
                                            />

                                            <label className={`${labelCls} mt-6`}>Upload file</label>
                                            <input
                                                type="file"
                                                disabled={leadProposalWizardUploadBusy}
                                                onChange={(e) => {
                                                    const f = e.target.files?.[0];
                                                    e.target.value = '';
                                                    if (f) void uploadLeadProposalWorkingFile(f);
                                                }}
                                                className={`text-base w-full ${isDark ? 'text-gray-300' : 'text-gray-700'}`}
                                            />
                                            {leadProposalWizardUploadBusy ? (
                                                <p className="mt-3 text-base text-primary-600">
                                                    <i className="fas fa-spinner fa-spin mr-2" aria-hidden />
                                                    Uploading…
                                                </p>
                                            ) : null}
                                        </div>
                                    );
                                }
                                if (leadProposalWizardStep === 3) {
                                    const cd = w.circulationDepartments || defaultCirculationDepartmentsUi();
                                    return (
                                        <div className={stepPanelCls}>
                                            <h3 className={wizStepTitleCls}>
                                                Step 3 — Circulation for comment, pricing and approval
                                            </h3>
                                            <p className={wizDescCls}>
                                                Capture comments by department and assign a responsible person for each. Assignees are
                                                notified when you save.
                                            </p>
                                            <div className="space-y-5">
                                                {LEAD_PROPOSAL_CIRCULATION_DEPARTMENTS.map((dept) => {
                                                    const row = cd[dept.key] || { comment: '', responsibleUserId: '' };
                                                    return (
                                                        <div
                                                            key={dept.key}
                                                            className={`rounded-xl border p-4 sm:p-5 ${isDark ? 'border-gray-600 bg-gray-900/35' : 'border-gray-200 bg-white'}`}
                                                        >
                                                            <div className="mb-3">
                                                                <span
                                                                    className={`text-sm md:text-base font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}
                                                                >
                                                                    {dept.label}
                                                                </span>
                                                            </div>
                                                            <label className={`${labelCls} text-sm`}>Comments</label>
                                                            <textarea
                                                                value={row.comment || ''}
                                                                onChange={(e) =>
                                                                    updateCirculationDepartment(dept.key, {
                                                                        comment: e.target.value
                                                                    })
                                                                }
                                                                rows={3}
                                                                className={`${inputCls} mb-4`}
                                                                placeholder="Departmental feedback…"
                                                            />
                                                            <label className={`${labelCls} text-sm`}>Responsible person</label>
                                                            <select
                                                                value={row.responsibleUserId || ''}
                                                                onChange={(e) =>
                                                                    updateCirculationDepartment(dept.key, {
                                                                        responsibleUserId: e.target.value
                                                                    })
                                                                }
                                                                className={inputCls}
                                                            >
                                                                <option value="">— Select responsible person —</option>
                                                                {circulationAssigneeUsers.map((u) => (
                                                                    <option key={u.id} value={u.id}>
                                                                        {u.name || u.email || u.id}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                }
                                return (
                                    <div className={stepPanelCls}>
                                        <h3 className={wizStepTitleCls}>Step 4 — Submission to client</h3>
                                        <p className={wizDescCls}>
                                            Sign off and record when the proposal was sent to the client.
                                        </p>
                                        <label className={labelCls}>Signed off by</label>
                                        <input
                                            type="text"
                                            value={w.signOffBy || ''}
                                            onChange={(e) => updateLeadProposalWizardWorkflow({ signOffBy: e.target.value })}
                                            className={`${inputCls} mb-3`}
                                            placeholder="Name and role"
                                        />
                                        <label className={labelCls}>Submission notes</label>
                                        <textarea
                                            value={w.submissionNotes || ''}
                                            onChange={(e) =>
                                                updateLeadProposalWizardWorkflow({ submissionNotes: e.target.value })
                                            }
                                            rows={3}
                                            className={`${inputCls} mb-3`}
                                            placeholder="e.g. Emailed PDF to procurement@…"
                                        />
                                        {w.submittedToClientAt ? (
                                            <div
                                                className={`rounded-lg border px-3 py-2 text-xs mb-3 ${isDark ? 'border-emerald-800 bg-emerald-950/40 text-emerald-200' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}
                                            >
                                                <i className="fas fa-check-circle mr-1" />
                                                Recorded as sent on{' '}
                                                {new Date(w.submittedToClientAt).toLocaleString('en-ZA', {
                                                    dateStyle: 'medium',
                                                    timeStyle: 'short'
                                                })}
                                            </div>
                                        ) : null}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const ts = new Date().toISOString();
                                                setLeadProposalWizardDraft((p) => {
                                                    if (!p) return p;
                                                    const wv = normalizeLeadProposalWorkflowUi(p.workflow);
                                                    return {
                                                        ...p,
                                                        status: 'Sent',
                                                        workflow: { ...wv, submittedToClientAt: ts }
                                                    };
                                                });
                                                setLeadProposalWizardHint('Submission timestamp recorded. Click Save & close to persist.');
                                                setTimeout(() => setLeadProposalWizardHint(''), 5000);
                                            }}
                                            className={`text-base font-semibold px-5 py-3 rounded-lg ${isDark ? 'bg-emerald-700 hover:bg-emerald-600 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}
                                        >
                                            <i className="fas fa-paper-plane mr-2" />
                                            {w.submittedToClientAt ? 'Update sent timestamp' : 'Record sent to client now'}
                                        </button>
                                    </div>
                                );
                            })()}
                        </div>

                        <div className={`shrink-0 flex flex-wrap items-center justify-between gap-3 border-t px-6 py-5 sm:px-8 ${isDark ? 'border-gray-700 bg-gray-900/60' : 'border-gray-200 bg-gray-50'}`}>
                            <div className="flex flex-wrap gap-3">
                                <button
                                    type="button"
                                    disabled={leadProposalWizardSaving || leadProposalWizardStep <= 1}
                                    onClick={() => goLeadProposalWizardStep(leadProposalWizardStep - 1)}
                                    className={`rounded-lg px-5 py-3 text-base font-medium ${isDark ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-white border border-gray-300 hover:bg-gray-50'} disabled:opacity-40`}
                                >
                                    Back
                                </button>
                                <button
                                    type="button"
                                    disabled={
                                        leadProposalWizardSaving ||
                                        leadProposalWizardStep >= 4 ||
                                        (leadProposalWizardStep === 1 && leadProposalWizardCreatingQ)
                                    }
                                    onClick={() => goLeadProposalWizardStep(leadProposalWizardStep + 1)}
                                    className={`rounded-lg px-5 py-3 text-base font-medium ${isDark ? 'bg-gray-700 text-gray-100 hover:bg-gray-600' : 'bg-gray-900 text-white hover:bg-gray-800'} disabled:opacity-40`}
                                >
                                    Next
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-3">
                                <button
                                    type="button"
                                    disabled={leadProposalWizardSaving}
                                    onClick={() => !leadProposalWizardSaving && closeLeadProposalWizard()}
                                    className={`rounded-lg px-5 py-3 text-base ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-200'}`}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    disabled={leadProposalWizardSaving || !String(leadProposalWizardDraft.title || '').trim()}
                                    onClick={() => void saveLeadProposalWizard()}
                                    className="rounded-lg bg-primary-600 px-6 py-3 text-base font-semibold text-white hover:bg-primary-700 disabled:opacity-50 shadow-sm"
                                >
                                    {leadProposalWizardSaving ? (
                                        <>
                                            <i className="fas fa-spinner fa-spin mr-2" />
                                            Saving…
                                        </>
                                    ) : (
                                        <>
                                            <i className="fas fa-save mr-2" />
                                            Save & close
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                );
                if (embedProposalWizardInLayout) {
                    return leadProposalWizardOverlay;
                }
                return typeof document !== 'undefined' &&
                    window.ReactDOM &&
                    typeof window.ReactDOM.createPortal === 'function'
                    ? window.ReactDOM.createPortal(leadProposalWizardOverlay, document.body)
                    : leadProposalWizardOverlay;
            })() : null}
            
            {showEngagementPrefillModal && (() => {
                const engagementPrefillOverlay = (
                <div
                    className="fixed inset-0 z-[10100] flex items-center justify-center bg-black bg-opacity-50 p-4"
                    onClick={() => !engagementBusy && setShowEngagementPrefillModal(false)}
                >
                    <div
                        className={`flex max-h-[92vh] w-full max-w-4xl flex-col rounded-xl shadow-2xl ${isDark ? 'bg-gray-800 text-gray-100' : 'bg-white text-gray-900'}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={`flex items-start justify-between gap-3 border-b px-6 py-4 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                            <div>
                                <h2 className="text-lg font-semibold">Questionnaire platform</h2>
                                <p className={`mt-1 text-xs leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                    Edit and resend from one place: manage versions, generate/copy/email links, and review submissions.
                                </p>
                            </div>
                            <button
                                type="button"
                                className={`shrink-0 rounded p-2 ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
                                onClick={() => !engagementBusy && setShowEngagementPrefillModal(false)}
                                aria-label="Close"
                            >
                                <i className="fas fa-times" />
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                            {engagementPrefillLoading ? (
                                <div className="py-12 text-center text-sm text-gray-500">Loading form…</div>
                            ) : (
                                <div className="space-y-6">
                                    <div>
                                        <label className={`mb-1 block text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                            Questionnaire name
                                        </label>
                                        <input
                                            type="text"
                                            className={`w-full rounded-lg border px-3 py-2 text-sm ${isDark ? 'border-gray-600 bg-gray-900 text-gray-100' : 'border-gray-300'}`}
                                            value={engagementQuestionnaireName}
                                            onChange={(e) => setEngagementQuestionnaireName(e.target.value)}
                                            placeholder="e.g. Opencast Mine Q2 Site Visit"
                                        />
                                        {!String(engagementQuestionnaireName || '').trim() ? (
                                            <p className={`mt-1 text-[11px] ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>
                                                Name is required to create a link.
                                            </p>
                                        ) : null}
                                    </div>
                                    {(() => {
                                        const selectedRow =
                                            getEngagementQuestionnaires().find((q) => q.id === selectedEngagementQuestionnaireId) || null;
                                        const versions = getEngagementSubmissionVersions(selectedRow);
                                        return (
                                            <div className={`rounded-lg border p-3 ${isDark ? 'border-gray-700 bg-gray-900/40' : 'border-gray-200 bg-gray-50'}`}>
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <h4 className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                        Submission versions
                                                    </h4>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className={`text-[11px] ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                                            {versions.length} submitted
                                                        </span>
                                                        {versions.length > 0 && selectedRow?.id ? (
                                                            <button
                                                                type="button"
                                                                className={`text-[11px] font-semibold px-2 py-1 rounded border ${isDark ? 'border-primary-500 text-primary-300 hover:bg-gray-800' : 'border-primary-500 text-primary-700 hover:bg-white'}`}
                                                                onClick={() => void handleOpenEngagementReport(String(selectedRow.id))}
                                                            >
                                                                Review submitted report
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                </div>
                                                {versions.length === 0 ? (
                                                    <p className={`mt-2 text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                                                        No submissions yet. Generate and share a link to collect the first response.
                                                    </p>
                                                ) : (
                                                    <div className="mt-2 space-y-1.5">
                                                        {versions
                                                            .slice()
                                                            .reverse()
                                                            .map((v) => (
                                                                <div
                                                                    key={v.id}
                                                                    className={`flex flex-wrap items-center justify-between gap-2 rounded border px-2.5 py-1.5 text-xs ${isDark ? 'border-gray-700 bg-gray-800/60 text-gray-300' : 'border-gray-200 bg-white text-gray-700'}`}
                                                                >
                                                                    <span>
                                                                        Version {v.version}
                                                                        <span className={`ml-2 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                                                                            {v.submittedAt ? new Date(v.submittedAt).toLocaleString('en-ZA') : 'Unknown date'}
                                                                        </span>
                                                                    </span>
                                                                    {(v.responses || v.submittedAt) && selectedRow?.id ? (
                                                                        <button
                                                                            type="button"
                                                                            className={`shrink-0 rounded px-2 py-1 text-[11px] font-semibold ${isDark ? 'bg-primary-700 text-white hover:bg-primary-600' : 'bg-primary-600 text-white hover:bg-primary-700'}`}
                                                                            onClick={() =>
                                                                                void handleOpenEngagementReport(String(selectedRow.id), v.version)
                                                                            }
                                                                        >
                                                                            Review
                                                                        </button>
                                                                    ) : null}
                                                                </div>
                                                            ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                    <div className={`rounded-lg border p-3 ${isDark ? 'border-gray-700 bg-gray-900/40' : 'border-gray-200 bg-gray-50'}`}>
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <h4 className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                Share actions
                                            </h4>
                                            {engagementShareLink ? (
                                                <span className={`text-[11px] ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Link ready</span>
                                            ) : null}
                                        </div>
                                        {selectedEngagementQuestionnaireId && engagementOpenedWithActiveLink && !engagementShareLink ? (
                                            <p className={`mt-2 text-[11px] leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                                A share link is already active for this questionnaire. Saving preserves it. Use regenerate to mint a new URL (old links stop working).
                                            </p>
                                        ) : null}
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                disabled={
                                                    engagementBusy ||
                                                    !String(selectedEngagementQuestionnaireId || '').trim()
                                                }
                                                onClick={() => regenerateEngagementShareLink()}
                                                title={
                                                    !String(selectedEngagementQuestionnaireId || '').trim()
                                                        ? 'Save the questionnaire first to create a link.'
                                                        : undefined
                                                }
                                                className={`text-[11px] px-2.5 py-1 rounded border ${isDark ? 'border-gray-500 text-gray-200 hover:bg-gray-700' : 'border-gray-300 text-gray-800 hover:bg-white'} disabled:opacity-50`}
                                            >
                                                {engagementBusy ? 'Saving…' : 'Regenerate share link'}
                                            </button>
                                            <button
                                                type="button"
                                                disabled={engagementBusy}
                                                onClick={handleCopyEngagementLinkFromModal}
                                                className={`text-[11px] px-2.5 py-1 rounded border ${isDark ? 'border-gray-500 text-gray-200 hover:bg-gray-700' : 'border-gray-300 text-gray-800 hover:bg-white'} disabled:opacity-50`}
                                            >
                                                Copy link
                                            </button>
                                            <button
                                                type="button"
                                                disabled={engagementBusy}
                                                onClick={handleEmailEngagementLinkFromModal}
                                                className={`text-[11px] px-2.5 py-1 rounded border ${isDark ? 'border-gray-500 text-gray-200 hover:bg-gray-700' : 'border-gray-300 text-gray-800 hover:bg-white'} disabled:opacity-50`}
                                            >
                                                Email link
                                            </button>
                                        </div>
                                        {engagementShareLink ? (
                                            <p className={`mt-2 break-all rounded border px-2 py-1 text-[11px] ${isDark ? 'border-gray-700 bg-gray-800/60 text-gray-300' : 'border-gray-200 bg-white text-gray-700'}`}>
                                                {engagementShareLink}
                                            </p>
                                        ) : null}
                                    </div>
                                    {(engagementFormDef?.sections || []).map((sec) => (
                                        <div
                                            key={sec.id}
                                            className={`rounded-xl border p-4 ${isDark ? 'border-gray-700 bg-gray-900/30' : 'border-gray-200 bg-gray-50/60'}`}
                                        >
                                            <h3 className={`mb-2 text-xs font-bold uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                {sec.heading}
                                            </h3>
                                            <div className="space-y-3">
                                                {sec.fields.map((f) => {
                                                    if (f.type === 'fileList') return null;
                                                    if (f.type === 'checkboxGroup') {
                                                        return (
                                                            <div key={f.id}>
                                                                <span className={`mb-1 block text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                                    {f.label}
                                                                </span>
                                                                <div className="flex flex-col gap-1.5">
                                                                    {(f.options || []).map((opt) => (
                                                                        <label key={opt.id} className="flex cursor-pointer items-center gap-2 text-xs">
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={!!engagementPrefillDraft[f.id]?.[opt.id]}
                                                                                onChange={() =>
                                                                                    setEngagementPrefillDraft((prev) => {
                                                                                        const cur =
                                                                                            prev[f.id] && typeof prev[f.id] === 'object'
                                                                                                ? { ...prev[f.id] }
                                                                                                : {};
                                                                                        cur[opt.id] = !cur[opt.id];
                                                                                        return { ...prev, [f.id]: cur };
                                                                                    })
                                                                                }
                                                                                className="rounded border-gray-400"
                                                                            />
                                                                            <span>{opt.label}</span>
                                                                        </label>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        );
                                                    }
                                                    const lbl = (
                                                        <span className={`mb-1 block text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                            {f.label}
                                                        </span>
                                                    );
                                                    if (f.type === 'textarea') {
                                                        return (
                                                            <div key={f.id}>
                                                                {lbl}
                                                                <textarea
                                                                    className={`w-full rounded-lg border px-3 py-2 text-sm ${isDark ? 'border-gray-600 bg-gray-900 text-gray-100' : 'border-gray-300'}`}
                                                                    rows={3}
                                                                    value={engagementPrefillDraft[f.id] ?? ''}
                                                                    onChange={(e) =>
                                                                        setEngagementPrefillDraft((prev) => ({
                                                                            ...prev,
                                                                            [f.id]: e.target.value
                                                                        }))
                                                                    }
                                                                />
                                                            </div>
                                                        );
                                                    }
                                                    if (f.type === 'date') {
                                                        return (
                                                            <div key={f.id}>
                                                                {lbl}
                                                                <input
                                                                    type="date"
                                                                    className={`w-full max-w-xs rounded-lg border px-3 py-2 text-sm ${isDark ? 'border-gray-600 bg-gray-900 text-gray-100' : 'border-gray-300'}`}
                                                                    value={engagementPrefillDraft[f.id] ?? ''}
                                                                    onChange={(e) =>
                                                                        setEngagementPrefillDraft((prev) => ({
                                                                            ...prev,
                                                                            [f.id]: e.target.value
                                                                        }))
                                                                    }
                                                                />
                                                            </div>
                                                        );
                                                    }
                                                    return (
                                                        <div key={f.id}>
                                                            {lbl}
                                                            <input
                                                                type="text"
                                                                className={`w-full rounded-lg border px-3 py-2 text-sm ${isDark ? 'border-gray-600 bg-gray-900 text-gray-100' : 'border-gray-300'}`}
                                                                value={engagementPrefillDraft[f.id] ?? ''}
                                                                onChange={(e) =>
                                                                    setEngagementPrefillDraft((prev) => ({
                                                                        ...prev,
                                                                        [f.id]: e.target.value
                                                                    }))
                                                                }
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                    <div className={`rounded-lg border p-3 ${isDark ? 'border-gray-700 bg-gray-900/40' : 'border-gray-200 bg-gray-50'}`}>
                                        <div className="mb-2 flex items-center justify-between">
                                            <h4 className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Custom fields</h4>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setEngagementCustomFieldsDraft((prev) => [
                                                        ...prev,
                                                        { id: `custom.new_${Date.now()}`, label: '', type: 'text', required: false, placeholder: '', hint: '', maxLength: 400 }
                                                    ])
                                                }
                                                className={`text-[11px] px-2 py-1 rounded border ${isDark ? 'border-gray-500 text-gray-200 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-white'}`}
                                            >
                                                Add field
                                            </button>
                                        </div>
                                        <div className="space-y-2">
                                            {engagementCustomFieldsDraft.length === 0 ? (
                                                <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>No custom fields yet.</div>
                                            ) : engagementCustomFieldsDraft.map((cf, idx) => (
                                                <div key={cf.id || idx} className={`rounded border p-2 ${isDark ? 'border-gray-700 bg-gray-800/60' : 'border-gray-200 bg-white'}`}>
                                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                                        <input
                                                            type="text"
                                                            className={`rounded border px-2 py-1.5 text-xs ${isDark ? 'border-gray-600 bg-gray-900 text-gray-100' : 'border-gray-300'}`}
                                                            value={cf.label || ''}
                                                            onChange={(e) =>
                                                                setEngagementCustomFieldsDraft((prev) => prev.map((row, i) => i === idx ? { ...row, label: e.target.value } : row))
                                                            }
                                                            placeholder="Field label"
                                                        />
                                                        <select
                                                            value={cf.type || 'text'}
                                                            onChange={(e) =>
                                                                setEngagementCustomFieldsDraft((prev) => prev.map((row, i) => i === idx ? { ...row, type: e.target.value } : row))
                                                            }
                                                            className={`rounded border px-2 py-1.5 text-xs ${isDark ? 'border-gray-600 bg-gray-900 text-gray-100' : 'border-gray-300'}`}
                                                        >
                                                            <option value="text">Text</option>
                                                            <option value="textarea">Textarea</option>
                                                            <option value="date">Date</option>
                                                        </select>
                                                        <label className="inline-flex items-center gap-2 text-xs">
                                                            <input
                                                                type="checkbox"
                                                                checked={cf.required === true}
                                                                onChange={(e) =>
                                                                    setEngagementCustomFieldsDraft((prev) => prev.map((row, i) => i === idx ? { ...row, required: e.target.checked } : row))
                                                                }
                                                            />
                                                            Required
                                                        </label>
                                                    </div>
                                                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                        <input
                                                            type="text"
                                                            className={`rounded border px-2 py-1.5 text-xs ${isDark ? 'border-gray-600 bg-gray-900 text-gray-100' : 'border-gray-300'}`}
                                                            value={cf.placeholder || ''}
                                                            onChange={(e) =>
                                                                setEngagementCustomFieldsDraft((prev) => prev.map((row, i) => i === idx ? { ...row, placeholder: e.target.value } : row))
                                                            }
                                                            placeholder="Placeholder (optional)"
                                                        />
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="text"
                                                                className={`flex-1 rounded border px-2 py-1.5 text-xs ${isDark ? 'border-gray-600 bg-gray-900 text-gray-100' : 'border-gray-300'}`}
                                                                value={cf.hint || ''}
                                                                onChange={(e) =>
                                                                    setEngagementCustomFieldsDraft((prev) => prev.map((row, i) => i === idx ? { ...row, hint: e.target.value } : row))
                                                                }
                                                                placeholder="Hint (optional)"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => setEngagementCustomFieldsDraft((prev) => prev.filter((_, i) => i !== idx))}
                                                                className={`text-[11px] px-2 py-1 rounded ${isDark ? 'text-red-400 hover:bg-gray-700' : 'text-red-600 hover:bg-red-50'}`}
                                                            >
                                                                Remove
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className={`flex justify-end gap-2 border-t px-6 py-4 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                            <button
                                type="button"
                                disabled={engagementBusy}
                                onClick={() => setShowEngagementPrefillModal(false)}
                                className={`rounded-lg px-4 py-2 text-sm ${isDark ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={
                                    engagementBusy ||
                                    engagementPrefillLoading ||
                                    !engagementFormDef ||
                                    !String(engagementQuestionnaireName || '').trim()
                                }
                                onClick={() =>
                                    commitEngagementLinkFromModal({
                                        copyToClipboard:
                                            !(Boolean(String(selectedEngagementQuestionnaireId || '').trim()) && engagementOpenedWithActiveLink),
                                        rotateToken: !(
                                            Boolean(String(selectedEngagementQuestionnaireId || '').trim()) && engagementOpenedWithActiveLink
                                        )
                                    })
                                }
                                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                            >
                                {engagementBusy
                                    ? 'Saving…'
                                    : Boolean(String(selectedEngagementQuestionnaireId || '').trim()) && engagementOpenedWithActiveLink
                                      ? 'Save changes'
                                      : 'Save + copy link'}
                            </button>
                        </div>
                    </div>
                </div>
                );
                return typeof document !== 'undefined' &&
                    window.ReactDOM &&
                    typeof window.ReactDOM.createPortal === 'function'
                    ? window.ReactDOM.createPortal(engagementPrefillOverlay, document.body)
                    : engagementPrefillOverlay;
            })()}

            {showEngagementResponsesModal && (() => {
                const engagementResponsesOverlay = (
                <div
                    className="fixed inset-0 z-[10150] flex items-center justify-center bg-black bg-opacity-50 p-4 sm:p-8"
                    onClick={() => {
                        setShowEngagementResponsesModal(false);
                        setEngagementInternalNote('');
                    }}
                >
                    <div
                        className={`flex max-h-[96vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl shadow-2xl ${isDark ? 'bg-gray-800 text-gray-100' : 'bg-white text-gray-900'}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={`no-print flex items-center justify-between border-b px-6 py-5 sm:px-10 sm:py-6 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                            <div>
                                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Questionnaire report</h2>
                                {engagementReportVersionNumber != null ? (
                                    <p className={`mt-1 text-sm sm:text-base ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                        Submission version {engagementReportVersionNumber}
                                    </p>
                                ) : null}
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowEngagementResponsesModal(false);
                                    setEngagementInternalNote('');
                                }}
                                className={`rounded-lg p-2.5 text-lg ${isDark ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'}`}
                                aria-label="Close"
                            >
                                <i className="fas fa-times" />
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-10 sm:py-8">
                            {engagementReportLoading ? (
                                <div className="py-20 text-center text-base text-gray-500">Loading report…</div>
                            ) : (() => {
                                const selectedRow =
                                    getEngagementQuestionnaires().find(
                                        (q) => String(q.id || '') === String(selectedEngagementQuestionnaireId || '')
                                    ) || null;
                                const { responses: reportResponses, submittedAt: reportSubmittedAt } =
                                    getEngagementReportResponsesAndMeta(selectedRow, formData, engagementReportVersionNumber);
                                if (
                                    engagementReportFormDef &&
                                    reportResponses &&
                                    typeof window.CustomerEngagementReportView === 'function'
                                ) {
                                    return React.createElement(window.CustomerEngagementReportView, {
                                        formDef: engagementReportFormDef,
                                        responses: reportResponses,
                                        branding: engagementReportBranding,
                                        submittedAt: reportSubmittedAt
                                    });
                                }
                                const rawPrefill =
                                    selectedRow?.prefill && typeof selectedRow.prefill === 'object' && !Array.isArray(selectedRow.prefill)
                                        ? selectedRow.prefill
                                        : null;
                                if (engagementReportFormDef && rawPrefill && Object.keys(rawPrefill).length > 0) {
                                    const lines = resolveEngagementPrefillLines(engagementReportFormDef, rawPrefill).filter(
                                        (l) => l.value && String(l.value).trim()
                                    );
                                    return (
                                        <div className="space-y-4">
                                            <p className={`text-base leading-relaxed sm:text-lg ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                                No submission on file yet. This is the{' '}
                                                <span className="font-medium">prefill snapshot</span> stored with the questionnaire (fields
                                                the recipient sees filled when they open the link).
                                            </p>
                                            <div
                                                className={`rounded-xl border p-6 sm:p-8 ${isDark ? 'border-gray-700 bg-gray-900/40' : 'border-gray-200 bg-gray-50'}`}
                                            >
                                                <h3 className={`mb-4 text-sm font-bold uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                                    Prefill snapshot
                                                </h3>
                                                {lines.length === 0 ? (
                                                    <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                                                        (No non-empty prefill values.)
                                                    </p>
                                                ) : (
                                                    <dl className="space-y-3 text-base sm:text-lg">
                                                        {lines.map((l) => (
                                                            <div key={l.label}>
                                                                <dt className={`text-sm font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{l.label}</dt>
                                                                <dd className={`mt-1 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{l.value}</dd>
                                                            </div>
                                                        ))}
                                                    </dl>
                                                )}
                                            </div>
                                        </div>
                                    );
                                }
                                return <p className="text-base text-gray-500">Could not load report. Try closing and opening again.</p>;
                            })()}
                        </div>
                        <div className={`no-print border-t px-6 py-5 sm:px-10 sm:py-6 ${isDark ? 'border-gray-700 bg-gray-800/80' : 'border-gray-200 bg-gray-50'}`}>
                            <label className={`mb-2 block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                Internal note (saved to activity log)
                            </label>
                            <textarea
                                value={engagementInternalNote}
                                onChange={(e) => setEngagementInternalNote(e.target.value)}
                                rows={3}
                                className={`mb-3 w-full rounded-lg border px-4 py-3 text-base ${isDark ? 'border-gray-600 bg-gray-900 text-gray-100' : 'border-gray-300 bg-white'}`}
                                placeholder="e.g. Follow up on diesel volumes…"
                            />
                            <button
                                type="button"
                                disabled={engagementNoteSaving || !engagementInternalNote.trim()}
                                onClick={appendEngagementInternalNote}
                                className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${isDark ? 'bg-primary-500 hover:bg-primary-400' : 'bg-primary-600 hover:bg-primary-700'}`}
                            >
                                {engagementNoteSaving ? 'Saving…' : 'Add note'}
                            </button>
                        </div>
                    </div>
                </div>
                );
                return typeof document !== 'undefined' &&
                    window.ReactDOM &&
                    typeof window.ReactDOM.createPortal === 'function'
                    ? window.ReactDOM.createPortal(engagementResponsesOverlay, document.body)
                    : engagementResponsesOverlay;
            })()}

            {/* Manage External Agents Modal - Admin Only */}
            {showManageExternalAgentsModal && (
                <div 
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]"
                    onClick={() => setShowManageExternalAgentsModal(false)}
                >
                    <div 
                        className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[80vh] flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-gray-200">
                            <h2 className="text-xl font-semibold text-gray-900">Manage External Agents</h2>
                        </div>
                        
                        {/* Body */}
                        <div className="p-6 overflow-y-auto flex-1">
                            {isLoadingExternalAgents ? (
                                <div className="text-center py-8">
                                    <i className="fas fa-spinner fa-spin text-2xl text-gray-400"></i>
                                    <p className="mt-2 text-sm text-gray-500">Loading external agents...</p>
                                </div>
                            ) : externalAgents.length === 0 ? (
                                <div className="text-center py-8">
                                    <i className="fas fa-users text-3xl text-gray-300 mb-2"></i>
                                    <p className="text-gray-500">No external agents found</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {externalAgents.map((agent) => (
                                        <div
                                            key={agent.id}
                                            className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                                        >
                                            <div className="flex-1">
                                                <div className="font-medium text-gray-900">{agent.name}</div>
                                                <div className="text-xs text-gray-500 mt-0.5">
                                                    {agent.isActive ? (
                                                        <span className="text-green-600">Active</span>
                                                    ) : (
                                                        <span className="text-gray-400">Inactive</span>
                                                    )}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteExternalAgent(agent.id, agent.name)}
                                                disabled={isDeletingExternalAgent}
                                                className="ml-3 px-3 py-1.5 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                                title="Delete external agent"
                                            >
                                                {isDeletingExternalAgent ? (
                                                    <i className="fas fa-spinner fa-spin"></i>
                                                ) : (
                                                    <i className="fas fa-trash"></i>
                                                )}
                                                <span>Delete</span>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        
                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
                            <button
                                onClick={() => setShowManageExternalAgentsModal(false)}
                                className="px-4 py-2 rounded-lg transition-colors bg-gray-100 hover:bg-gray-200 text-gray-700"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Make available globally with error handling wrapper
try {
    window.ClientDetailModal = ClientDetailModal;
} catch (error) {
    console.error('❌ Error registering ClientDetailModal:', error);
    // Fallback: wrap in error boundary component
    window.ClientDetailModal = ({ client, onClose, ...props }) => {
        try {
            return React.createElement(ClientDetailModal, { client, onClose, ...props });
        } catch (err) {
            console.error('❌ ClientDetailModal render error:', err);
            return React.createElement('div', { 
                className: 'p-4 bg-red-50 border border-red-200 rounded-lg' 
            }, React.createElement('p', { className: 'text-red-800' }, 'Error loading client details. Please refresh the page.'));
        }
    };
}
// CONTACT FILTER: Only shows site-specific contacts - no "All Contacts" option
// This ensures contacts are always properly linked to specific sites

