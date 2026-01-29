// Get dependencies from window
const { useState, useEffect, useMemo, useCallback, useRef, startTransition } = React;
const SectionCommentWidget = window.SectionCommentWidget;
// Don't capture window.storage at module load; resolve at call time to avoid stale reference
// Safe storage helper functions
const safeStorage = {
    getClients: () => {
        const s = window.storage || {};
        return typeof s.getClients === 'function' ? s.getClients() : null;
    },
    setClients: (data) => {
        const s = window.storage || {};
        return typeof s.setClients === 'function' ? s.setClients(data) : null;
    },
    getProjects: () => {
        const s = window.storage || {};
        return typeof s.getProjects === 'function' ? s.getProjects() : null;
    },
    setProjects: (data) => {
        const s = window.storage || {};
        return typeof s.setProjects === 'function' ? s.setProjects(data) : null;
    },
    getGroups: () => {
        try {
            const cached = localStorage.getItem('abcotronics_groups');
            if (cached) {
                const parsed = JSON.parse(cached);
                // Always return cached data for instant display, even if expired
                // The API will refresh it in the background
                return parsed;
            }
            return null;
        } catch (e) {
            // Silently fail - cache load error is non-critical
            return null;
        }
    },
    setGroups: (data) => {
        try {
            localStorage.setItem('abcotronics_groups', JSON.stringify(data));
            localStorage.setItem('abcotronics_groups_timestamp', Date.now().toString());
        } catch (e) {
            // Silently fail - cache save error is non-critical
        }
    }
};

// Map of critical modal bundles to ensure they can be recovered if the initial script tag failed to load
const CRITICAL_COMPONENT_SCRIPTS = {
    ClientDetailModal: './dist/src/components/clients/ClientDetailModal.js?v=permanent-block-1762361500',
    // LeadDetailModal removed - now using unified ClientDetailModal with entityType='lead'
    OpportunityDetailModal: './dist/src/components/clients/OpportunityDetailModal.js',
    Pipeline: './dist/src/components/clients/Pipeline.js?v=remove-kanban-1764388650'
};

const useEnsureGlobalComponent = (globalName) => {
    const [component, setComponent] = useState(() => (typeof window !== 'undefined' ? window[globalName] || null : null));

    useEffect(() => {
        if (typeof window === 'undefined' || typeof document === 'undefined') {
            return;
        }

        if (component) {
            return;
        }

        let cancelled = false;
        const updateComponent = () => {
            if (cancelled) return;
            const globalComponent = window[globalName];
            if (globalComponent) {
                setComponent(globalComponent);
            }
        };

        // Already registered?
        if (window[globalName]) {
            updateComponent();
            return;
        }

        const scriptSrc = CRITICAL_COMPONENT_SCRIPTS[globalName];
        if (!scriptSrc) {
            console.warn(`⚠️ No recovery script registered for ${globalName}`);
            return;
        }

        const normalisedSrc = scriptSrc.startsWith('/') || scriptSrc.startsWith('http')
            ? scriptSrc
            : `/${scriptSrc.replace(/^\.\//, '')}`;

        const existingScript = Array.from(document.getElementsByTagName('script')).find((script) => {
            if (!script.src) return false;
            const cleaned = script.src.replace(location.origin, '').split('?')[0];
            return cleaned === normalisedSrc.split('?')[0] || script.dataset?.componentName === globalName;
        });

        if (existingScript) {
            existingScript.dataset.componentName = existingScript.dataset.componentName || globalName;
            existingScript.addEventListener('load', updateComponent, { once: true });
            existingScript.addEventListener('error', () => {
                if (!cancelled) {
                    console.error(`❌ Failed to load ${globalName} from existing script tag`);
                }
            }, { once: true });
            return () => {
                cancelled = true;
            };
        }

        const script = document.createElement('script');
        script.async = true;
        script.dataset.componentName = globalName;
        script.src = `${normalisedSrc}${normalisedSrc.includes('?') ? '&' : '?'}fallback=${Date.now()}`;
        script.onload = updateComponent;
        script.onerror = (error) => {
            if (!cancelled) {
                console.error(`❌ Failed to lazy-load ${globalName} from ${script.src}`, error);
            }
        };

        document.body.appendChild(script);

        return () => {
            cancelled = true;
            script.onload = null;
            script.onerror = null;
        };
    }, [component, globalName]);

    return component;
};

// Performance optimization: Memoized client data processor
let clientDataCache = null;
let clientDataCacheTimestamp = 0;
let lastApiCallTimestamp = 0;
let lastLeadsApiCallTimestamp = 0;
let lastLiveDataSyncTime = 0;
let lastLiveDataClientsHash = null;
let isFirstLoad = true; // Track if this is the first load after page refresh
let isLeadsLoading = false; // Prevent concurrent loadLeads calls
let isClientsLoading = false; // Prevent concurrent loadClients calls
let lastGroupsApiCallTimestamp = 0; // Throttle groups API calls
const GROUPS_API_CALL_INTERVAL = 30000; // Only call groups API every 30 seconds max
const CACHE_DURATION = 60000; // 60 seconds
const API_CALL_INTERVAL = 30000; // Only call API every 30 seconds max (increased to prevent 429 errors)
const FORCE_REFRESH_MIN_INTERVAL = 5000; // Minimum 5 seconds between force refresh calls (increased)
const LIVE_SYNC_THROTTLE = 5000; // Skip LiveDataSync updates if data hasn't changed in 5 seconds (increased)

const PIPELINE_STAGES = ['No Engagement', 'Awareness', 'Interest', 'Desire', 'Action'];
const PIPELINE_STAGE_ALIASES = {
    'no engagement': 'No Engagement',
    awareness: 'Awareness',
    interest: 'Interest',
    desire: 'Desire',
    action: 'Action',
    prospect: 'Awareness',
    new: 'Awareness',
    qualification: 'Interest',
    discovery: 'Interest',
    evaluation: 'Interest',
    proposal: 'Desire',
    negotiation: 'Action',
    contracting: 'Action',
    closing: 'Action'
};

function normalizePipelineStage(stage) {
    if (!stage || typeof stage !== 'string') {
        return PIPELINE_STAGES[0];
    }

    const trimmed = stage.trim();
    if (PIPELINE_STAGES.includes(trimmed)) {
        return trimmed;
    }

    const alias = PIPELINE_STAGE_ALIASES[trimmed.toLowerCase()];
    return alias || PIPELINE_STAGES[0];
}

function resolveStarredState(entity) {
    if (!entity || typeof entity !== 'object') {
        return false;
    }

    const normalizeFlag = (value) => {
        if (value === true || value === 1) {
            return true;
        }
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            return normalized === 'true' || normalized === '1' || normalized === 'yes';
        }
        return false;
    };

    if (normalizeFlag(entity.isStarred)) {
        return true;
    }
    if (normalizeFlag(entity.starred)) {
        return true;
    }
    if (Array.isArray(entity.starredBy) && entity.starredBy.length > 0) {
        return true;
    }
    if (Array.isArray(entity.starredClients) && entity.starredClients.length > 0) {
        return true;
    }
    if (Array.isArray(entity.starred_leads) && entity.starred_leads.length > 0) {
        return true;
    }

    return false;
}

function extractStageValue(value) {
    if (!value) {
        return null;
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed || null;
    }

    if (typeof value === 'object') {
        const nestedCandidates = [value.stage, value.status, value.name, value.label, value.title];
        for (const candidate of nestedCandidates) {
            const nestedValue = extractStageValue(candidate);
            if (nestedValue) {
                return nestedValue;
            }
        }
    }

    return null;
}

function resolvePipelineStage(entity) {
    if (!entity || typeof entity !== 'object') {
        return PIPELINE_STAGES[0];
    }

    const candidateSources = [
        entity.stage,
        entity.pipelineStage,
        entity.pipelineStageName,
        entity.pipelineStageLabel,
        entity.pipelineStatus,
        entity.stageName,
        entity.stageLabel,
        entity.salesStage,
        entity.currentStage,
        entity.pipeline?.stage,
        entity.pipeline?.status,
        entity.pipeline?.name,
        entity.pipeline?.label,
        entity.pipeline?.currentStage,
        entity.pipelineStageData,
        entity.pipeline_stage
    ];

    for (const source of candidateSources) {
        const value = extractStageValue(source);
        if (value) {
            return normalizePipelineStage(value);
        }
    }

    if (typeof entity.pipeline === 'string') {
        try {
            const parsedPipeline = JSON.parse(entity.pipeline);
            const parsedValue = extractStageValue(parsedPipeline) ||
                extractStageValue(parsedPipeline?.currentStage) ||
                extractStageValue(parsedPipeline?.stage) ||
                extractStageValue(parsedPipeline?.status);
            if (parsedValue) {
                return normalizePipelineStage(parsedValue);
            }
        } catch (_error) {
            // Ignore JSON parse errors and fall through to default
        }
    }

    return PIPELINE_STAGES[0];
}

function ensureLeadStage(lead) {
    if (!lead || typeof lead !== 'object') {
        return lead;
    }

    const hasValidStage = typeof lead.stage === 'string' && lead.stage.trim().length > 0;
    if (hasValidStage) {
        return {
            ...lead,
            stage: normalizePipelineStage(lead.stage)
        };
    }

    const resolvedStage = resolvePipelineStage(lead) || PIPELINE_STAGES[0];
    return {
        ...lead,
        stage: resolvedStage
    };
}

function normalizeGroupMemberships(rawMemberships, legacyGroups) {
    let memberships = rawMemberships;
    if (typeof memberships === 'string' && memberships.trim() !== '') {
        try {
            memberships = JSON.parse(memberships);
        } catch (_error) {
            memberships = memberships
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean);
        }
    }

    if (!Array.isArray(memberships)) {
        memberships = [];
    }

    const normalized = memberships.map((membership) => {
        if (membership && typeof membership === 'object') {
            if (membership.group && typeof membership.group === 'object') {
                return {
                    ...membership,
                    group: {
                        id: membership.group.id || null,
                        name: membership.group.name || null,
                        type: membership.group.type || null
                    }
                };
            }
            return membership;
        }
        return membership;
    });

    if (normalized.length > 0) {
        return normalized;
    }

    const fallbackNames = [];
    const addName = (value) => {
        if (typeof value !== 'string') {
            return;
        }
        const trimmed = value.trim();
        if (trimmed && !fallbackNames.includes(trimmed)) {
            fallbackNames.push(trimmed);
        }
    };

    if (typeof legacyGroups === 'string') {
        legacyGroups.split(',').forEach(addName);
    } else if (Array.isArray(legacyGroups)) {
        legacyGroups.forEach((item) => {
            if (typeof item === 'string') {
                addName(item);
            } else if (item && typeof item === 'object') {
                addName(item.name || item.group?.name || item.title || item.label);
            }
        });
    } else if (legacyGroups && typeof legacyGroups === 'object') {
        addName(legacyGroups.name || legacyGroups.group?.name || legacyGroups.title || legacyGroups.label);
    }

    if (fallbackNames.length === 0) {
        return normalized;
    }

    return fallbackNames.map((name) => ({
        group: { id: null, name, type: null },
        name
    }));
}

function resolveGroupNames(entity) {
    if (!entity || typeof entity !== 'object') {
        return [];
    }

    const memberships = normalizeGroupMemberships(
        entity.groupMemberships,
        entity.companyGroup || entity.company_group || entity.groups || entity.group
    );

    const groupNames = [];
    memberships.forEach((membership) => {
        if (membership && typeof membership === 'object') {
            if (membership.group) {
                const groupName = typeof membership.group === 'object' && membership.group !== null
                    ? membership.group.name
                    : (typeof membership.group === 'string' ? membership.group : null);
                if (groupName && !groupNames.includes(groupName)) {
                    groupNames.push(groupName);
                }
            }
            if (membership.name && !groupNames.includes(membership.name)) {
                groupNames.push(membership.name);
            }
        } else if (typeof membership === 'string') {
            const trimmed = membership.trim();
            if (trimmed && !groupNames.includes(trimmed)) {
                groupNames.push(trimmed);
            }
        }
    });

    return groupNames;
}

/** Shared display for list tables: prefer API relation, then resolve from loaded externalAgents by id */
function getExternalAgentDisplay(entity, externalAgentsList = []) {
    if (!entity) return '—';
    const name = entity.externalAgent?.name ?? (entity.externalAgentId && externalAgentsList.find(a => a.id === entity.externalAgentId)?.name);
    return name || '—';
}

function normalizeLeadStages(leadsArray = []) {
    if (!Array.isArray(leadsArray)) {
        return [];
    }
    return leadsArray
        .filter(Boolean)
        .map((lead) => {
            const stagedLead = ensureLeadStage(lead);
            return {
                ...stagedLead,
                groupMemberships: normalizeGroupMemberships(
                    stagedLead.groupMemberships,
                    stagedLead.companyGroup || stagedLead.company_group || stagedLead.groups || stagedLead.group
                )
            };
        });
}

function processClientData(rawClients, cacheKey) {
    // Use cached processed data if available and recent
    const now = Date.now();
    if (clientDataCache && (now - clientDataCacheTimestamp < CACHE_DURATION)) {
        return clientDataCache;
    }
    
    // Ensure rawClients is always an array
    if (!rawClients || !Array.isArray(rawClients)) {
        return [];
    }
    
    // Process the data
    const startTime = performance.now();
    const processed = rawClients.map(c => {
        // Preserve type as-is, don't default null/undefined to 'client'
        // This ensures leads aren't accidentally converted to clients
        const clientType = c.type; // Keep null/undefined as-is, don't default
        const isLead = clientType === 'lead';
        let status = c.status;
        const isStarred = resolveStarredState(c);
        
        // Convert status based on type
        if (isLead) {
            // For leads: preserve status as-is (Potential, Active, Disinterested)
            status = c.status || 'Potential';
        } else {
            // For clients: convert lowercase to capitalized
            if (c.status === 'active') status = 'Active';
            else if (c.status === 'inactive') status = 'Inactive';
            else status = c.status || 'Inactive';
        }
        
        return {
        id: c.id,
        name: c.name,
        status: status,
        stage: resolvePipelineStage(c),
        industry: c.industry || 'Other',
        type: clientType, // Preserve null/undefined - will be filtered out later
        revenue: c.revenue || 0,
        lastContact: new Date(c.updatedAt || c.createdAt).toISOString().split('T')[0],
        address: c.address || '',
        website: c.website || '',
        notes: c.notes || '',
        contacts: Array.isArray(c.contacts) ? c.contacts : (typeof c.contacts === 'string' ? JSON.parse(c.contacts || '[]') : []),
        followUps: Array.isArray(c.followUps) ? c.followUps : (typeof c.followUps === 'string' ? JSON.parse(c.followUps || '[]') : []),
        projectIds: Array.isArray(c.projectIds) ? c.projectIds : [],
        comments: Array.isArray(c.comments) ? c.comments : (typeof c.comments === 'string' ? JSON.parse(c.comments || '[]') : []),
        sites: Array.isArray(c.sites) ? c.sites : (Array.isArray(c.clientSites) ? c.clientSites : (typeof c.sites === 'string' ? JSON.parse(c.sites || '[]') : [])),
        opportunities: Array.isArray(c.opportunities) ? c.opportunities : [],
        contracts: Array.isArray(c.contracts) ? c.contracts : (typeof c.contracts === 'string' ? JSON.parse(c.contracts || '[]') : []),
        activityLog: Array.isArray(c.activityLog) ? c.activityLog : (typeof c.activityLog === 'string' ? JSON.parse(c.activityLog || '[]') : []),
        billingTerms: typeof c.billingTerms === 'object' ? c.billingTerms : (typeof c.billingTerms === 'string' ? JSON.parse(c.billingTerms || '{}') : {
            paymentTerms: 'Net 30',
            billingFrequency: 'Monthly',
            currency: 'ZAR',
            retainerAmount: 0,
            taxExempt: false,
            notes: ''
        }),
        services: Array.isArray(c.services) ? c.services : (typeof c.services === 'string' ? JSON.parse(c.services || '[]') : []),
        ownerId: c.ownerId || null,
        isStarred,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        // CRITICAL: Preserve externalAgentId and externalAgent to prevent data loss
        externalAgentId: c.externalAgentId || null,
        externalAgent: c.externalAgent || null,
        // Preserve group data from API - handle both direct fields and nested structures
        groupMemberships: normalizeGroupMemberships(
            c.groupMemberships,
            c.companyGroup || c.company_group || c.groups || c.group
        ),
        // Preserve KYC so it survives list load and hard refresh
        kyc: (c.kyc != null && typeof c.kyc === 'object') ? c.kyc : (typeof c.kyc === 'string' && c.kyc.trim() ? (() => { try { return JSON.parse(c.kyc); } catch (_) { return {}; } })() : (c.kycJsonb != null && typeof c.kycJsonb === 'object' ? c.kycJsonb : {}))
        };
    });
    
    // Cache the result
    clientDataCache = processed;
    clientDataCacheTimestamp = now;
    
    const endTime = performance.now();
    
    return processed;
}

function resolveEntityId(entity) {
    if (!entity || typeof entity !== 'object') {
        return null;
    }

    const candidateKeys = [
        'id',
        'leadId',
        'clientId',
        'uuid',
        '_id',
        'publicId',
        'externalId',
        'recordId',
        'tempId',
        'localId',
        'legacyId'
    ];

    for (const key of candidateKeys) {
        const value = entity[key];
        if (value !== undefined && value !== null && value !== '') {
            return value;
        }
    }

    if (entity.metadata && entity.metadata.id) {
        return entity.metadata.id;
    }

    if (Array.isArray(entity.identifiers)) {
        const identifier = entity.identifiers.find((val) => val !== undefined && val !== null && val !== '');
        if (identifier) {
            return identifier;
        }
    }

    return null;
}

function generateFallbackId(entity, prefix = 'record') {
    const safePrefix = prefix || 'record';
    const rawName = typeof entity?.name === 'string' && entity.name.trim() ? entity.name.trim().toLowerCase() : safePrefix;
    const sanitizedName = rawName.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || safePrefix;

    const timestampSource =
        entity?.createdAt ||
        entity?.updatedAt ||
        entity?.firstContactDate ||
        entity?.lastContact ||
        Date.now();

    let timestamp = Date.now();
    if (typeof timestampSource === 'number' && Number.isFinite(timestampSource)) {
        timestamp = timestampSource;
    } else if (typeof timestampSource === 'string') {
        const parsed = Date.parse(timestampSource);
        if (!Number.isNaN(parsed)) {
            timestamp = parsed;
        }
    }

    return `${safePrefix}-${sanitizedName}-${timestamp}`;
}

function normalizeEntityId(entity, prefix = 'record') {
    const existing = resolveEntityId(entity);
    if (existing !== undefined && existing !== null && existing !== '') {
        return { id: existing, generated: false };
    }

    return { id: generateFallbackId(entity, prefix), generated: true };
}

function buildOpportunitySignature(opp) {
    if (!opp || typeof opp !== 'object') {
        return 'null';
    }

    const { id } = normalizeEntityId(opp, 'opportunity');
    const stage = normalizePipelineStage(opp.stage || '');
    const value = Number(
        opp.value ??
        opp.amount ??
        opp.estimatedValue ??
        opp.expectedValue ??
        0
    ) || 0;
    const updatedAt =
        opp.updatedAt ||
        opp.expectedCloseDate ||
        opp.closeDate ||
        opp.createdAt ||
        '';

    return `${id}|${stage}|${value}|${updatedAt}`;
}

function haveOpportunitiesChanged(existingOpps, newOpps) {
    if (!Array.isArray(existingOpps) && !Array.isArray(newOpps)) {
        return false;
    }

    if (!Array.isArray(existingOpps) || !Array.isArray(newOpps)) {
        return true;
    }

    if (existingOpps.length !== newOpps.length) {
        return true;
    }

    const existingSignatures = existingOpps.map(buildOpportunitySignature).sort();
    const newSignatures = newOpps.map(buildOpportunitySignature).sort();

    for (let i = 0; i < existingSignatures.length; i += 1) {
        if (existingSignatures[i] !== newSignatures[i]) {
            return true;
        }
    }

    return false;
}

function buildOpportunitiesSignature(opportunities) {
    if (!Array.isArray(opportunities) || opportunities.length === 0) {
        return 'empty';
    }

    const signatures = opportunities.map(buildOpportunitySignature).sort();
    return signatures.join('||');
}

// Services Dropdown Component with checkboxes
const ServicesDropdown = ({ services, selectedServices, onSelectionChange, isDark }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    // Helper functions to handle both objects and strings
    const getServiceString = (service) => {
        if (typeof service === 'string') return service;
        if (typeof service === 'object' && service !== null) {
            return service.name || service.id || service.description || JSON.stringify(service);
        }
        return String(service || '');
    };

    const getServiceKey = (service, index) => {
        if (typeof service === 'string') return service;
        if (typeof service === 'object' && service !== null) {
            return service.id || service.name || `service-${index}`;
        }
        return `service-${index}`;
    };

    const areServicesEqual = (s1, s2) => {
        if (s1 === s2) return true; // Reference equality or primitive equality
        if (typeof s1 === 'object' && typeof s2 === 'object' && s1 !== null && s2 !== null) {
            // Compare by id if available, otherwise by name
            if (s1.id && s2.id) return s1.id === s2.id;
            if (s1.name && s2.name) return s1.name === s2.name;
            return JSON.stringify(s1) === JSON.stringify(s2);
        }
        return false;
    };

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isOpen]);

    const handleToggle = (service) => {
        const isSelected = selectedServices.some(s => areServicesEqual(s, service));
        if (isSelected) {
            onSelectionChange(selectedServices.filter(s => !areServicesEqual(s, service)));
        } else {
            onSelectionChange([...selectedServices, service]);
        }
    };

    const handleClear = (e) => {
        e.stopPropagation();
        onSelectionChange([]);
    };

    const displayText = selectedServices.length === 0 
        ? 'All Services' 
        : selectedServices.length === 1 
            ? getServiceString(selectedServices[0])
            : `${selectedServices.length} selected`;

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-colors text-left flex items-center justify-between ${
                    isDark 
                        ? 'bg-gray-700 border-gray-600 text-gray-200 focus:bg-gray-700' 
                        : 'bg-gray-50 border-gray-300 text-gray-900 focus:bg-white'
                }`}
            >
                <span>{displayText}</span>
                <div className="flex items-center gap-2">
                    {selectedServices.length > 0 && (
                        <button
                            type="button"
                            onClick={handleClear}
                            className={`transition-colors ${
                                isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-400 hover:text-gray-600'
                            }`}
                            title="Clear selection"
                        >
                            <i className="fas fa-times text-xs"></i>
                        </button>
                    )}
                    <i className={`fas fa-chevron-${isOpen ? 'up' : 'down'} text-xs`}></i>
                </div>
            </button>
            {isOpen && services.length > 0 && (
                <div className={`absolute z-50 w-full mt-1 border rounded-lg shadow-lg max-h-60 overflow-auto ${
                    isDark 
                        ? 'bg-gray-700 border-gray-600' 
                        : 'bg-white border-gray-300'
                }`}>
                    {services.map((service, index) => {
                        const isSelected = selectedServices.some(s => areServicesEqual(s, service));
                        return (
                            <label
                                key={getServiceKey(service, index)}
                                className={`flex items-center px-4 py-2 cursor-pointer hover:bg-opacity-50 ${
                                    isDark 
                                        ? 'hover:bg-gray-600' 
                                        : 'hover:bg-gray-100'
                                }`}
                            >
                                <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => handleToggle(service)}
                                    className={`mr-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${
                                        isDark ? 'bg-gray-600 border-gray-500' : ''
                                    }`}
                                />
                                <span className={`text-sm ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                                    {getServiceString(service)}
                                </span>
                            </label>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// No initial data - all data comes from database

const Clients = React.memo(() => {
    const [viewMode, setViewMode] = useState('clients');
    const [isPipelineLoading, setIsPipelineLoading] = useState(false);
    const isLoadingOpportunitiesRef = useRef(false); // Prevent concurrent opportunity loads
    const [pipelineTypeFilter, setPipelineTypeFilter] = useState('all');
    const PipelineComponent = useEnsureGlobalComponent('Pipeline');
    const NewsFeedComponent = useEnsureGlobalComponent('ClientNewsFeed');
    const isNewPipelineAvailable = Boolean(PipelineComponent);
    // Initialize all data from cache immediately to prevent flashing counts
    // This ensures counts appear instantly on page load
    const [clients, setClients] = useState(() => {
        const cachedClients = safeStorage.getClients();
        if (cachedClients && Array.isArray(cachedClients)) {
            // Separate clients and leads from cache
            const clientsOnly = cachedClients.filter(c => c.type === 'client' || c.type === null || c.type === undefined);
            return clientsOnly;
        }
        return [];
    });
    const [leads, setLeads] = useState(() => {
        const cachedClients = safeStorage.getClients();
        if (cachedClients && Array.isArray(cachedClients)) {
            // Separate leads from cache
            const leadsOnly = cachedClients.filter(c => c.type === 'lead');
            return leadsOnly;
        }
        return [];
    });
    // Initialize groups from cache immediately for instant loading
    const [groups, setGroups] = useState(() => {
        const cachedGroups = safeStorage.getGroups();
        return cachedGroups || [];
    });
    const [isLoadingGroups, setIsLoadingGroups] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState(null);
    const [groupMembers, setGroupMembers] = useState([]);
    const [isLoadingGroupMembers, setIsLoadingGroupMembers] = useState(false);
    const [groupMembersError, setGroupMembersError] = useState(null); // Track errors loading group members
    const clientsRef = useRef(clients); // Ref to track current clients for LiveDataSync
    const leadsRef = useRef(leads);
    const viewModeRef = useRef(viewMode); // Ref to track current viewMode for LiveDataSync
    const isUserEditingRef = useRef(false); // Ref to track if user is editing
    const isAutoSavingRef = useRef(false); // Ref to track if auto-saving is in progress
    const isFormOpenRef = useRef(false); // Ref to track if any form is open
    const selectedClientRef = useRef(null); // Ref to track selected client
    const selectedLeadRef = useRef(null); // Ref to track selected lead
    const pipelineOpportunitiesLoadedRef = useRef(new Map());
    const latestApiClientsRef = useRef(null); // Ref to store latest API response for groupMemberships preservation
    const groupMembershipsFetchRef = useRef(false); // Prevent multiple simultaneous groupMemberships fetches
    const processedClientIdsRef = useRef(new Set()); // Track which client IDs have been processed to prevent re-fetching
    const restoredGroupMembershipsRef = useRef(new Map()); // Track restored groupMemberships by client ID to prevent overwriting
    const hasForceRefreshedLeadsForSitesRef = useRef(false); // Force refresh once when opening Leads so site child rows load
    
    // Industry management state - declared early to avoid temporal dead zone issues
    const [industries, setIndustries] = useState([]);
    const [showIndustryModal, setShowIndustryModal] = useState(false);
    const [newIndustryName, setNewIndustryName] = useState('');
    const [isLoadingIndustries, setIsLoadingIndustries] = useState(false);
    
    // External agents state
    const [externalAgents, setExternalAgents] = useState([]);
    const [isLoadingExternalAgents, setIsLoadingExternalAgents] = useState(false);
    
    // PERFORMANCE FIX: Preload Pipeline and News Feed components on mount for instant button clicks
    useEffect(() => {
        // Preload Pipeline component if not already available
        if (!window.Pipeline && !window.PipelineView && CRITICAL_COMPONENT_SCRIPTS.Pipeline) {
            const existingPipelineScript = Array.from(document.getElementsByTagName('script')).find((script) => {
                return script.src && (script.src.includes('Pipeline.js') || script.dataset?.componentName === 'Pipeline');
            });
            
            if (!existingPipelineScript) {
                const script = document.createElement('script');
                script.async = true;
                script.dataset.componentName = 'Pipeline';
                const scriptSrc = CRITICAL_COMPONENT_SCRIPTS.Pipeline;
                const normalisedSrc = scriptSrc.startsWith('/') || scriptSrc.startsWith('http')
                    ? scriptSrc
                    : `/${scriptSrc.replace(/^\.\//, '')}`;
                script.src = `${normalisedSrc}${normalisedSrc.includes('?') ? '&' : '?'}preload=${Date.now()}`;
                document.body.appendChild(script);
            }
        }
        
        // Preload ClientNewsFeed component if not already available
        if (!window.ClientNewsFeed) {
            // Check if script already exists
            const existingNewsScript = Array.from(document.getElementsByTagName('script')).find((script) => {
                return script.src && (script.src.includes('ClientNewsFeed.js') || script.dataset?.componentName === 'ClientNewsFeed');
            });
            
            if (!existingNewsScript) {
                const script = document.createElement('script');
                script.async = true;
                script.dataset.componentName = 'ClientNewsFeed';
                script.src = `/dist/src/components/clients/ClientNewsFeed.js?preload=${Date.now()}`;
                document.body.appendChild(script);
            }
        }
    }, []); // Run once on mount
    
    // PERFORMANCE FIX: Combine ref sync effects into one to reduce re-renders
    useEffect(() => {
        clientsRef.current = clients;
        leadsRef.current = leads;
        viewModeRef.current = viewMode;
    }, [clients, leads, viewMode]);
    
    // Ensure viewMode is always valid on mount and when it changes
    useEffect(() => {
        const validListViews = ['clients', 'leads', 'pipeline', 'groups'];
        const validDetailViews = ['client-detail', 'lead-detail', 'opportunity-detail'];
        const validViews = [...validListViews, ...validDetailViews, 'news-feed'];
        
        if (!validViews.includes(viewMode)) {
            // Invalid viewMode detected - resetting to "clients"
            setViewMode('clients');
        }
    }, [viewMode]);
    
    // REMOVED: Group enrichment useEffect - was causing rate limit issues
    // The group data should come from the main API response, not separate API calls


    // Utility function to calculate time since first contact
    const getTimeSinceFirstContact = (firstContactDate) => {
        if (!firstContactDate) return 'Not set';
        
        const firstContact = new Date(firstContactDate);
        const now = new Date();
        const diffTime = Math.abs(now - firstContact);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return '1 day ago';
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`;
        if (diffDays < 365) return `${Math.ceil(diffDays / 30)} months ago`;
        return `${Math.ceil(diffDays / 365)} years ago`;
    };
    // Calculate leadsCount from leads.length using useMemo to prevent flickering
    // Removed useState - now calculated directly from leads array
    const [projects, setProjects] = useState([]);
    // Just store IDs - modals fetch their own data
    const [editingClientId, setEditingClientId] = useState(null);
    const [editingLeadId, setEditingLeadId] = useState(null);
    const [fullClientForDetail, setFullClientForDetail] = useState(null); // Fetched client with KYC for modal
    const [selectedOpportunityId, setSelectedOpportunityId] = useState(null);
    const [selectedOpportunityClient, setSelectedOpportunityClient] = useState(null);
    const [currentTab, setCurrentTab] = useState('overview');
    const [currentLeadTab, setCurrentLeadTab] = useState('overview');
    const [openSiteIdForLead, setOpenSiteIdForLead] = useState(null);
    const [openSiteIdForClient, setOpenSiteIdForClient] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterIndustry, setFilterIndustry] = useState('All Industries');
    const [filterStatus, setFilterStatus] = useState('All Status');
    const [filterStage, setFilterStage] = useState('All Stages');
    const [filterServices, setFilterServices] = useState(() => {
        try {
            const saved = localStorage.getItem('clients_filterServices');
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });
    
    // State declarations moved before useEffect hooks to avoid temporal dead zone errors
    const [showStarredOnly, setShowStarredOnly] = useState(false);
    const [sortField, setSortField] = useState('name');
    const [sortDirection, setSortDirection] = useState('asc');
    const [leadSortField, setLeadSortField] = useState('name');
    const [leadSortDirection, setLeadSortDirection] = useState('asc');
    const [showSitesInLeadsList, setShowSitesInLeadsList] = useState(() => {
        try {
            const v = localStorage.getItem('clients.leads.showSitesInList');
            return v !== null ? v === 'true' : true;
        } catch {
            return true;
        }
    });
    const [showSitesInClientsList, setShowSitesInClientsList] = useState(() => {
        try {
            const v = localStorage.getItem('clients.clients.showSitesInList');
            return v !== null ? v === 'true' : true;
        } catch {
            return true;
        }
    });
    // Sites loaded via GET /api/sites/client/:id when "Show sites" is on (so list always shows sites even if list API omits them)
    const [sitesForList, setSitesForList] = useState({});
    const [clientsPage, setClientsPage] = useState(1);
    const [leadsPage, setLeadsPage] = useState(1);
    const [groupsPage, setGroupsPage] = useState(1);
    const ITEMS_PER_PAGE = 25;
    
    useEffect(() => {
        try {
            localStorage.setItem('clients.leads.showSitesInList', String(showSitesInLeadsList));
        } catch (_) {}
    }, [showSitesInLeadsList]);
    useEffect(() => {
        try {
            localStorage.setItem('clients.clients.showSitesInList', String(showSitesInClientsList));
        } catch (_) {}
    }, [showSitesInClientsList]);

    // Persist filterServices to localStorage whenever it changes
    useEffect(() => {
        try {
            localStorage.setItem('clients_filterServices', JSON.stringify(filterServices));
        } catch (error) {
            // Silently fail - localStorage persistence is non-critical
        }
    }, [filterServices]);
    
    // PERFORMANCE FIX: Reset pagination to page 1 when filters change
    useEffect(() => {
        if (viewMode === 'clients' && clientsPage > 1) {
            setClientsPage(1);
        }
    }, [searchTerm, filterIndustry, filterStatus, filterServices, showStarredOnly, viewMode]);
    
    useEffect(() => {
        if (viewMode === 'leads' && leadsPage > 1) {
            setLeadsPage(1);
        }
    }, [searchTerm, filterIndustry, filterStatus, filterStage, showStarredOnly, viewMode]);
    
    useEffect(() => {
        if (viewMode === 'groups' && groupsPage > 1) {
            setGroupsPage(1);
        }
    }, [searchTerm, viewMode]);
    
    // Get current user and check if admin
    const currentUser = window.storage?.getUser?.();
    const isAdmin = currentUser?.role?.toLowerCase() === 'admin';
    
    // Debug logging removed for performance - only log in development mode if needed
    // useEffect(() => {
    // }, [currentUser, isAdmin, showIndustryModal]);
    
    // Debug modal state changes removed for performance
    // useEffect(() => {
    // }, [showIndustryModal]);
    
    // Fetch industries from API
    const loadIndustries = useCallback(async () => {
        try {
            setIsLoadingIndustries(true);
            const token = window.storage?.getToken?.();
            if (!token) {
                // No token available - skip industry fetch
                return;
            }
            if (window.RateLimitManager?.isRateLimited?.()) return;
            
            const response = await fetch('/api/industries', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                const industriesList = data?.data?.industries || data?.industries || [];
                setIndustries(industriesList);
            } else if (response.status === 429) {
                const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
                window.RateLimitManager?.setRateLimit?.(retryAfter);
            } else {
                console.error('Failed to load industries:', response.statusText);
            }
        } catch (error) {
            if (error?.status !== 429 && error?.code !== 'RATE_LIMIT_EXCEEDED') {
                console.error('Error loading industries:', error);
            }
        } finally {
            setIsLoadingIndustries(false);
        }
    }, []);
    
    // Add new industry
    const handleAddIndustry = useCallback(async () => {
        if (!newIndustryName.trim()) {
            alert('Please enter an industry name');
            return;
        }
        
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Authentication required');
                return;
            }
            
            const response = await fetch('/api/industries', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({ name: newIndustryName.trim() })
            });
            
            if (response.ok) {
                const data = await response.json();
                const newIndustry = data?.data?.industry || data?.industry;
                if (newIndustry) {
                    setIndustries(prev => [...prev, newIndustry].sort((a, b) => a.name.localeCompare(b.name)));
                    setNewIndustryName('');
                    alert('Industry added successfully');
                }
            } else {
                const errorData = await response.json().catch(() => ({}));
                alert(errorData?.error || 'Failed to add industry');
            }
        } catch (error) {
            console.error('Error adding industry:', error);
            alert('Error adding industry: ' + error.message);
        }
    }, [newIndustryName]);
    
    // Delete industry
    const handleDeleteIndustry = useCallback(async (industryId) => {
        if (!confirm('Are you sure you want to delete this industry?')) {
            return;
        }
        
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Authentication required');
                return;
            }
            
            const response = await fetch(`/api/industries/${industryId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });
            
            if (response.ok) {
                setIndustries(prev => prev.filter(ind => ind.id !== industryId));
                alert('Industry deleted successfully');
            } else {
                const errorData = await response.json().catch(() => ({}));
                alert(errorData?.error || 'Failed to delete industry');
            }
        } catch (error) {
            console.error('Error deleting industry:', error);
            alert('Error deleting industry: ' + error.message);
        }
    }, []);
    
    // Load industries on mount
    useEffect(() => {
        loadIndustries();
    }, [loadIndustries]);
    
    const pipelineStageOrder = useMemo(() => {
        const order = {};
        PIPELINE_STAGES.forEach((stage, index) => {
            order[stage] = index;
        });
        return order;
    }, []);
    const pipelineItems = useMemo(() => {
        const leadItems = Array.isArray(leads) ? leads.map((lead) => {
            const stage = normalizePipelineStage(lead.stage || lead.lifecycleStage || lead.statusStage || '');
            const value =
                Number(
                    lead.estimatedValue ??
                    lead.potentialValue ??
                    lead.projectedValue ??
                    lead.value ??
                    lead.amount ??
                    0
                ) || 0;
            const updatedAt = new Date(
                lead.updatedAt ||
                lead.lastContact ||
                lead.followUps?.[0]?.date ||
                lead.createdAt ||
                Date.now()
            ).getTime();

            return {
                id: lead.id ?? lead.leadId ?? lead.uuid ?? `lead-${Math.random().toString(36).slice(2)}`,
                key: `lead-${lead.id ?? lead.leadId ?? lead.uuid ?? lead.name ?? Date.now()}`,
                type: 'lead',
                name: lead.name || lead.title || 'Untitled Lead',
                stage,
                value,
                organization: lead.company || lead.organization || lead.industry || 'Unknown industry',
                owner: lead.ownerName || lead.owner || '',
                updatedAt,
                raw: lead
            };
        }) : [];

        const opportunityItems = Array.isArray(clients)
            ? clients.flatMap((client) => {
                const opportunities = Array.isArray(client.opportunities) ? client.opportunities : [];
                return opportunities.map((opp) => {
                    const stage = normalizePipelineStage(opp.stage);
                    const value =
                        Number(
                            opp.value ??
                            opp.amount ??
                            opp.estimatedValue ??
                            opp.expectedValue ??
                            0
                        ) || 0;
                    const updatedAt = new Date(
                        opp.updatedAt ||
                        opp.expectedCloseDate ||
                        opp.closeDate ||
                        opp.createdAt ||
                        client.updatedAt ||
                        Date.now()
                    ).getTime();

                    return {
                        id: opp.id ?? opp.uuid ?? `opportunity-${client.id}-${Math.random().toString(36).slice(2)}`,
                        key: `opportunity-${opp.id ?? opp.uuid ?? `${client.id}-${opp.title ?? opp.name ?? Date.now()}`}`,
                        type: 'opportunity',
                        name: opp.title || opp.name || 'Untitled Opportunity',
                        stage,
                        value,
                        organization: client.name || opp.client?.name || 'Unknown client',
                        owner: opp.ownerName || opp.owner || client.ownerName || '',
                        updatedAt,
                        raw: opp,
                        clientId: client.id,
                        clientName: client.name || opp.client?.name || ''
                    };
                });
            })
            : [];

        return [...leadItems, ...opportunityItems];
    }, [clients, leads]);
    // FIXED: Load opportunities only once when entering pipeline view, NOT on every client change
    useEffect(() => {
        // Only run when entering pipeline view, not on every render
        if (viewMode !== 'pipeline') {
            if (isPipelineLoading) {
                setIsPipelineLoading(false);
            }
            return;
        }

        if (!window.DatabaseAPI?.getOpportunities) {
            return;
        }

        if (!Array.isArray(clients) || clients.length === 0) {
            return;
        }

        // CRITICAL: Prevent concurrent calls
        if (isLoadingOpportunitiesRef.current) {
            return;
        }

        // Check if we already have opportunities loaded
        const hasOpportunities = clients.some(c => c.opportunities && c.opportunities.length > 0);
        if (hasOpportunities && pipelineOpportunitiesLoadedRef.current.size > 0) {
            return;
        }

        let cancelled = false;
        isLoadingOpportunitiesRef.current = true;
        setIsPipelineLoading(true);

        (async () => {
            try {
                const response = await window.DatabaseAPI.getOpportunities();
                const allOpportunities = response?.data?.opportunities || [];
                const opportunitiesByClient = {};

                allOpportunities.forEach((opp) => {
                    const clientId = opp.clientId || opp.client?.id;
                    if (!clientId) {
                        return;
                    }

                    if (!opportunitiesByClient[clientId]) {
                        opportunitiesByClient[clientId] = [];
                    }
                    opportunitiesByClient[clientId].push(opp);
                });

                if (cancelled) {
                    return;
                }

                // Update clients with opportunities WITHOUT triggering re-render loop
                // CRITICAL: Use prevClients to preserve restored groupMemberships
                setClients(prevClients => {
                    const updatedClients = prevClients.map((client) => {
                    if (!client?.id) {
                        return client;
                    }

                    const apiOpps = opportunitiesByClient[client.id] || [];
                    const signature = buildOpportunitiesSignature(apiOpps);
                    pipelineOpportunitiesLoadedRef.current.set(client.id, { signature });

                        // CRITICAL: Always create new object reference and preserve ALL group data
                    return {
                        ...client,
                            opportunities: apiOpps,
                            // CRITICAL: Preserve group data from current state (which may have been restored)
                            groupMemberships: Array.isArray(client.groupMemberships) ? [...client.groupMemberships] : []
                    };
                });
                safeStorage.setClients(updatedClients);
                    return updatedClients;
                });
            } catch (error) {
                // Silently fail for server errors (500s) - opportunities preserved from cache
                const isServerError =
                    error?.message?.includes('500') ||
                    error?.message?.includes('Server error') ||
                    error?.message?.includes('Failed to list opportunities');
                // Don't log - opportunities are preserved from cache
            } finally {
                if (!cancelled) {
                    isLoadingOpportunitiesRef.current = false;
                    setIsPipelineLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
            isLoadingOpportunitiesRef.current = false;
        };
    }, [viewMode]); // CRITICAL: Only depend on viewMode, NOT clients
    useEffect(() => {
        if (viewMode !== 'pipeline' && isPipelineLoading) {
            setIsPipelineLoading(false);
        }
    }, [viewMode, isPipelineLoading]);
    
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
    
    // Simple sync control - just stop/start
    const stopSync = useCallback(() => {
        if (window.LiveDataSync?.isRunning) {
            window.LiveDataSync.stop();
        }
    }, []);
    
    const startSync = useCallback(() => {
        if (window.LiveDataSync && !window.LiveDataSync.isRunning) {
            window.LiveDataSync.start();
        }
    }, []);

    // Handle opening client/lead - moved here to fix temporal dead zone issue
    const handleOpenClient = useCallback((client, options = {}) => {
        stopSync();
        const clientId = client?.id;
        setEditingClientId(clientId);
        setEditingLeadId(null);
        selectedClientRef.current = client;
        selectedLeadRef.current = null;
        isFormOpenRef.current = true;
        setCurrentTab(options.initialTab || 'overview');
        setViewMode('client-detail');

        // Prefetch full client (including KYC) immediately so modal shows persisted KYC after refresh
        if (clientId) {
            const getOne = window.DatabaseAPI?.getClient || window.api?.getClient;
            if (typeof getOne === 'function') {
                getOne(clientId, { forceRefresh: true })
                    .then((res) => {
                        const data = res?.data?.client ?? res?.client ?? res?.data ?? res;
                        if (data && data.id === clientId) setFullClientForDetail(data);
                    })
                    .catch(() => {});
            }
        }

        // CRITICAL: Don't update URL with client ID - this can cause RouteState to misinterpret it as a project ID
        // The client modal is rendered via viewMode='client-detail', not via URL routing
        // Only update URL if explicitly needed, and use a prefix to avoid conflicts
        // if (window.RouteState && client?.id) {
        //     window.RouteState.setPageSubpath('clients', ['client', String(client.id)], {
        //         replace: false,
        //         preserveSearch: false,
        //         preserveHash: false
        //     });
        // }
    }, [stopSync]);

    const handleOpenClientToSite = useCallback((client, site) => {
        if (!client?.id) return;
        if (site?.id) setOpenSiteIdForClient(site.id);
        handleOpenClient(client, { initialTab: 'sites' });
    }, [handleOpenClient]);

    const handleOpenLead = useCallback((lead, options = {}) => {
        const candidateLead = lead ? { ...lead } : null;
        let leadId = options.leadId ?? resolveEntityId(candidateLead);
        let usedFallback = false;

        if (!leadId) {
            const normalized = normalizeEntityId(candidateLead || {}, 'lead');
            leadId = normalized.id;
            usedFallback = normalized.generated;

            if (candidateLead) {
                candidateLead.id = String(leadId);
                if (normalized.generated) {
                    candidateLead.tempId = String(leadId);
                }
            }
        }

        if (!leadId) {
            // Unable to open lead without identifier - skip
            return;
        }

        const normalizedId = String(leadId);

        if (candidateLead) {
            candidateLead.id = normalizedId;
            if (usedFallback && !candidateLead.tempId) {
                candidateLead.tempId = normalizedId;
            }
        }

        if (usedFallback) {
            // Fallback identifier used for lead (disabled debug logging)
        }

        stopSync();
        setEditingLeadId(normalizedId);
        setEditingClientId(null);
        selectedLeadRef.current = candidateLead;
        selectedClientRef.current = null;
        isFormOpenRef.current = true;
        
        // Update URL to reflect the selected lead
        if (window.RouteState && normalizedId) {
            window.RouteState.setPageSubpath('clients', [normalizedId], {
                replace: false,
                preserveSearch: false,
                preserveHash: false
            });
        }
        
        if (options.fromPipeline) {
            try {
                sessionStorage.setItem('returnToPipeline', 'true');
            } catch (error) {
                // Silently fail - sessionStorage access is non-critical
            }
        }
        setCurrentLeadTab(options.initialTab || 'overview');
        setViewMode('lead-detail');
    }, [stopSync]);

    const handleOpenLeadToSite = useCallback((lead, site) => {
        if (!lead?.id) return;
        // Set state so lead detail opens on Sites tab with this site
        if (site?.id) {
            setOpenSiteIdForLead(site.id);
        }
        // Open lead with initialTab so we don't reset to overview
        handleOpenLead(lead, { initialTab: 'sites' });
        // Update URL to include ?tab=sites&siteId= so link targets the site and survives refresh
        if (window.RouteState && window.RouteState.navigate) {
            const search = new URLSearchParams({ tab: 'sites' });
            if (site?.id) search.set('siteId', String(site.id));
            window.RouteState.navigate({
                page: 'clients',
                segments: [String(lead.id)],
                search: search.toString(),
                preserveSearch: false,
                preserveHash: false,
                replace: true
            });
        }
    }, [handleOpenLead]);

    // Listen for entity navigation events (from notifications, comments, etc.)
    useEffect(() => {
        const handleEntityNavigation = async (event) => {
            if (!event.detail) return;
            
            const { entityType, entityId, options } = event.detail;
            if (!entityType || !entityId) return;
            
            // Handle client entities
            if (entityType === 'client' || entityType === 'lead' || entityType === 'opportunity') {
                // Find the entity in our data
                let entity = null;
                if (entityType === 'client') {
                    entity = clients.find(c => c.id === entityId);
                } else if (entityType === 'lead') {
                    entity = leads.find(l => l.id === entityId);
                } else if (entityType === 'opportunity') {
                    // Find opportunity in clients' opportunities
                    for (const client of clients) {
                        const opp = (client.opportunities || []).find(o => o.id === entityId);
                        if (opp) {
                            entity = { ...opp, clientId: client.id, clientName: client.name };
                            break;
                        }
                    }
                }
                
                if (entity) {
                    if (entityType === 'client') {
                        handleOpenClient(entity);
                    } else if (entityType === 'lead') {
                        handleOpenLead(entity);
                    } else if (entityType === 'opportunity') {
                        // Open opportunity detail view
                        setViewMode('opportunity-detail');
                        selectedLeadRef.current = entity;
                    }
                    
                    // Handle tab navigation if specified
                    if (options?.tab && window.setCurrentTab) {
                        setTimeout(() => {
                            window.setCurrentTab?.(options.tab);
                        }, 100);
                    }
                } else {
                    // Entity not found in cache, try to fetch it
                    // Entity not found in cache, attempting to fetch from API
                    // The component will handle loading when viewMode changes
                }
            }
        };
        
        window.addEventListener('openEntityDetail', handleEntityNavigation);
        return () => window.removeEventListener('openEntityDetail', handleEntityNavigation);
    }, [clients, leads, handleOpenClient, handleOpenLead]);
    
    // Listen for resetClientsView event to reset view when navigating from detail pages
    useEffect(() => {
        const handleResetView = (event) => {
            const targetViewMode = event.detail?.viewMode || 'clients';
            setViewMode(targetViewMode);
            selectedClientRef.current = null;
            selectedLeadRef.current = null;
            setEditingClientId(null);
            setEditingLeadId(null);
            isFormOpenRef.current = false;
        };
        
        window.addEventListener('resetClientsView', handleResetView);
        return () => window.removeEventListener('resetClientsView', handleResetView);
    }, []);

    // Sync parent state when Pipeline updates stage/status so values don't revert on view switch or refetch
    useEffect(() => {
        const handlePipelineLeadsClientsUpdated = (event) => {
            const { leads: nextLeads, clients: nextClients } = event.detail || {};
            if (Array.isArray(nextLeads)) {
                setLeads(nextLeads);
                try { window.storage?.setLeads?.(nextLeads); } catch (_) {}
            }
            if (Array.isArray(nextClients)) {
                setClients(nextClients);
                try { safeStorage.setClients(nextClients); } catch (_) {}
            }
        };
        window.addEventListener('pipelineLeadsClientsUpdated', handlePipelineLeadsClientsUpdated);
        return () => window.removeEventListener('pipelineLeadsClientsUpdated', handlePipelineLeadsClientsUpdated);
    }, []);
    
    // Prefetch full client (including KYC) when opening client detail so the modal shows persisted KYC
    useEffect(() => {
        if (viewMode !== 'client-detail' || !editingClientId) {
            setFullClientForDetail(null);
            return;
        }
        const getOne = window.DatabaseAPI?.getClient || window.api?.getClient;
        if (typeof getOne !== 'function') return;
        let cancelled = false;
        getOne(editingClientId, { forceRefresh: true })
            .then((res) => {
                if (cancelled) return;
                const data = res?.data?.client ?? res?.client ?? res?.data ?? res;
                if (data && data.id === editingClientId) setFullClientForDetail(data);
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [viewMode, editingClientId]);
    
    // Listen for route changes to reset view mode when navigating to base clients page
    useEffect(() => {
        if (!window.RouteState) return;
        
        const handleRouteChange = async (route) => {
            if (route?.page !== 'clients') return;
            
            // If no segments, ensure we're showing a valid list view
            // CRITICAL: Don't reset detail views if they were opened programmatically (via handleOpenClient/handleOpenLead)
            // Only reset if the viewMode is invalid or if we're navigating away from a detail view via URL
            if (!route.segments || route.segments.length === 0) {
                const validListViews = ['clients', 'leads', 'pipeline', 'groups', 'news-feed'];
                const validDetailViews = ['client-detail', 'lead-detail', 'opportunity-detail'];
                const isValidView = validListViews.includes(viewMode) || validDetailViews.includes(viewMode);
                
                // If viewMode is invalid, reset to 'clients' (the default list view)
                if (!isValidView) {
                    setViewMode('clients');
                    selectedClientRef.current = null;
                    selectedLeadRef.current = null;
                }
                // REMOVED: Don't automatically clear detail views when URL has no segments
                // This allows modals to stay open when opened programmatically (via handleOpenClient)
                // Detail views will only close when explicitly closed by the user or when navigating to a different route
                // else if (validDetailViews.includes(viewMode)) {
                //     // Clear detail view when URL has no segments
                //     setViewMode('clients');
                //     selectedClientRef.current = null;
                //     selectedLeadRef.current = null;
                // }
                return;
            }
            
            // URL contains an entity ID - open that entity
            const entityId = route.segments[0];
            if (!entityId) return;
            
            // Handle "new" route for creating new client/lead - don't try to fetch it
            // Check if the first segment is "new" (new client) or if we have ["leads", "new"] (new lead)
            const isNewClient = entityId === 'new';
            const isNewLead = route.segments.length >= 2 && route.segments[0] === 'leads' && route.segments[1] === 'new';
            
            if (isNewClient || isNewLead) {
                if (isNewLead) {
                    // Open new lead form
                    setEditingLeadId(null);
                    setEditingClientId(null);
                    selectedLeadRef.current = null;
                    selectedClientRef.current = null;
                    isFormOpenRef.current = true;
                    setViewMode('lead-detail');
                    setCurrentLeadTab('overview');
                } else {
                    // Open new client form
                    setEditingClientId(null);
                    setEditingLeadId(null);
                    selectedClientRef.current = null;
                    selectedLeadRef.current = null;
                    isFormOpenRef.current = true;
                    setViewMode('client-detail');
                    setCurrentTab('overview');
                }
                return;
            }
            
            // Determine entity type from URL or try to find in clients/leads
            let entity = null;
            let entityType = null;
            
            // Try to find in clients first
            entity = clients.find(c => String(c.id) === String(entityId));
            if (entity) {
                entityType = 'client';
            } else {
                // Try to find in leads
                const leadFromList = leads.find(l => String(l.id) === String(entityId));
                if (leadFromList) {
                    entityType = 'lead';
                    // Always refetch lead from API when opening from URL so we get sites (list rarely has clientSites)
                    try {
                        if (window.DatabaseAPI?.getLead || window.api?.getLead) {
                            const getLead = window.DatabaseAPI?.getLead || window.api?.getLead;
                            const leadRes = await getLead(entityId);
                            const leadData = leadRes?.data?.lead ?? leadRes?.lead ?? leadRes?.data ?? leadRes;
                            if (leadData && leadData.id) {
                                const sites = Array.isArray(leadData.clientSites)
                                    ? leadData.clientSites
                                    : (Array.isArray(leadData.sites) ? leadData.sites : []);
                                entity = { ...leadData, sites };
                            } else {
                                entity = leadFromList;
                            }
                        } else {
                            entity = leadFromList;
                        }
                    } catch (_) {
                        entity = leadFromList;
                    }
                } else {
                    // Not in list: try lead API first so GET /api/leads/:id always runs for lead URLs (sites load)
                    try {
                        const getLead = window.DatabaseAPI?.getLead || window.api?.getLead;
                        if (getLead) {
                            const leadRes = await getLead(entityId);
                            const leadData = leadRes?.data?.lead ?? leadRes?.lead ?? leadRes?.data ?? leadRes;
                            if (leadData && leadData.id) {
                                const sites = Array.isArray(leadData.clientSites)
                                    ? leadData.clientSites
                                    : (Array.isArray(leadData.sites) ? leadData.sites : []);
                                entity = { ...leadData, sites };
                                entityType = 'lead';
                            }
                        }
                        if (!entity && (window.DatabaseAPI?.getClient)) {
                            const response = await window.DatabaseAPI.getClient(entityId);
                            const clientData = response?.data?.client || response?.client || response?.data;
                            if (clientData) {
                                entity = clientData;
                                entityType = clientData.type === 'lead' ? 'lead' : 'client';
                            }
                        }
                    } catch (error) {
                        console.error('Failed to load client/lead from URL:', error);
                    }
                }
            }
            
            if (entity && entityType) {
                // When opening an entity: set tab to overview only if we're not already viewing this entity.
                // If we're already on this lead/client (e.g. we added a contact and leads refetched), leave
                // the current tab so we don't revert from Contacts/Sites/Calendar back to Overview.
                const alreadyViewingThisLead = entityType === 'lead' && viewMode === 'lead-detail' &&
                    (String(editingLeadId) === String(entity.id) || String(selectedLeadRef.current?.id) === String(entity.id));
                const alreadyViewingThisClient = entityType === 'client' && viewMode === 'client-detail' &&
                    (String(editingClientId) === String(entity.id) || String(selectedClientRef.current?.id) === String(entity.id));

                if (entityType === 'client') {
                    if (!alreadyViewingThisClient) setCurrentTab('overview');
                    handleOpenClient(entity);
                } else if (entityType === 'lead') {
                    const tabFromUrl = route.search?.get('tab');
                    const siteIdFromUrl = route.search?.get('siteId');
                    if (tabFromUrl) setCurrentLeadTab(tabFromUrl);
                    else if (!alreadyViewingThisLead) setCurrentLeadTab('overview');
                    if (siteIdFromUrl) setOpenSiteIdForLead(siteIdFromUrl);
                    handleOpenLead(entity, tabFromUrl ? { initialTab: tabFromUrl } : {});
                }
                
                // Handle tab/section/comment from query params
                const tab = route.search?.get('tab');
                const section = route.search?.get('section');
                const commentId = route.search?.get('commentId');
                
                const siteIdFromUrl = route.search?.get('siteId');
                if (entityType === 'lead' && siteIdFromUrl) setOpenSiteIdForLead(siteIdFromUrl);
                if (tab || section || commentId) {
                    setTimeout(() => {
                        if (tab) {
                            window.dispatchEvent(new CustomEvent('switchClientsTab', {
                                detail: { tab, section, commentId, siteId: siteIdFromUrl || undefined }
                            }));
                        }
                        if (section) {
                            window.dispatchEvent(new CustomEvent('switchClientsSection', {
                                detail: { section, commentId }
                            }));
                        }
                        if (commentId) {
                            window.dispatchEvent(new CustomEvent('scrollToComment', {
                                detail: { commentId }
                            }));
                        }
                    }, 200);
                }
            }
        };
        
        // Check initial route
        const currentRoute = window.RouteState.getRoute();
        handleRouteChange(currentRoute);
        
        // Subscribe to route changes
        const unsubscribe = window.RouteState.subscribe(handleRouteChange);
        
        return () => {
            if (unsubscribe && typeof unsubscribe === 'function') {
                unsubscribe();
            }
        };
    }, [viewMode, clients, leads, handleOpenClient, handleOpenLead, editingLeadId, editingClientId]);

    // Modal callbacks no longer needed - modals own their state
    
    // Stop LiveDataSync when viewing client/lead list, restart when entering detail views
    // Note: Detail views (client-detail, lead-detail) will stop LiveDataSync completely via modals
    useEffect(() => {
        if (!window.LiveDataSync) return;
        
        // Stop sync when viewing list views (clients or leads)
        const isListView = viewMode === 'clients' || viewMode === 'leads' || viewMode === 'pipeline' || viewMode === 'groups';
        
        if (isListView) {
            // Only stop if not already stopped (avoid duplicate stops)
            if (window.LiveDataSync.isRunning) {
                window.LiveDataSync.stop();
            }
        } else {
            // Detail views - modals will handle stopping LiveDataSync
            // Don't restart here - let modals handle it
        }
        
        // Cleanup: restart when component unmounts if we stopped it
        return () => {
            if (isListView && !window.LiveDataSync.isRunning) {
                window.LiveDataSync?.start();
            }
        };
    }, [viewMode]);
    
    // Render tracking removed to prevent console spam
    
    // Function to load clients (can be called to refresh) - MOVED BEFORE useEffects
    const loadClients = async (forceRefresh = false) => {
        // On first load, always force refresh to get fresh data with groups
        if (isFirstLoad) {
            forceRefresh = true;
            isFirstLoad = false;
        }
        
        // Prevent concurrent calls - if already loading, skip unless force refresh
        if (isClientsLoading && !forceRefresh) {
            return; // Already loading, skip duplicate call
        }
        
        // Set loading flag
        isClientsLoading = true;
        const loadStartTime = performance.now();
        try {
            // If force refresh, clear caches first so Company Group (and External Agent) come from API
            if (forceRefresh) {
                if (window.dataManager?.invalidate) {
                    window.dataManager.invalidate('clients');
                }
                if (window.DatabaseAPI?.clearCache) {
                    window.DatabaseAPI.clearCache('/clients');
                }
                if (window.ClientCache?.clearCache) {
                    window.ClientCache.clearCache();
                }
                pipelineOpportunitiesLoadedRef.current.clear();
                // Clear processClientData cache so we don't reuse stale processed data missing groupMemberships
                clientDataCache = null;
                clientDataCacheTimestamp = 0;
            }
            
            // IMMEDIATELY show cached data without waiting for API (unless force refresh)
            const cachedClients = safeStorage.getClients();
            
            if (cachedClients && cachedClients.length > 0 && !forceRefresh) {
                // Separate clients and leads from cache
                // CRITICAL: Ensure groupMemberships is always present (even if empty array)
                const filteredCachedClients = cachedClients
                    .filter(client => client.type === 'client')
                    .map(client => ({
                        ...client,
                        // Ensure groupMemberships is always an array - parse if it's a string from localStorage
                        groupMemberships: normalizeGroupMemberships(
                            client.groupMemberships,
                            client.companyGroup || client.company_group || client.groups || client.group
                        )
                    }));
                const cachedLeads = cachedClients.filter(client => 
                    client.type === 'lead'
                );
                
                // Show cached clients IMMEDIATELY
                // NOTE: These may not have groupMemberships if cached before groups were added
                // The API call below will update them with fresh data including groupMemberships
                // CRITICAL: Use prevClients to preserve any restored groups
                // Only update if data actually changed to prevent unnecessary re-renders
                if (filteredCachedClients.length > 0) {
                    setClients(prevClients => {
                        // Check if clients actually changed
                        if (prevClients.length === filteredCachedClients.length &&
                            prevClients.every((c, i) => c?.id === filteredCachedClients[i]?.id)) {
                            // Data hasn't changed, but check if groups need updating
                            const needsUpdate = prevClients.some((prevClient, i) => {
                                const cachedClient = filteredCachedClients[i];
                                const prevGroups = prevClient.groupMemberships || [];
                                const cachedGroups = cachedClient.groupMemberships || [];
                                return prevGroups.length !== cachedGroups.length ||
                                    !prevGroups.every((g, j) => {
                                        const prevGroupId = g?.group?.id || g?.id || g;
                                        const cachedGroupId = cachedGroups[j]?.group?.id || cachedGroups[j]?.id || cachedGroups[j];
                                        return prevGroupId === cachedGroupId;
                                    });
                            });
                            if (!needsUpdate) {
                                return prevClients; // No change, return previous to prevent re-render
                            }
                        }
                        
                        // If we already have clients with restored groups, preserve them
                        if (prevClients.length > 0) {
                            return prevClients.map(prevClient => {
                                const cachedClient = filteredCachedClients.find(c => c.id === prevClient.id);
                                if (cachedClient) {
                                    // Merge cached client with preserved groups from current state
                                    return {
                                        ...cachedClient,
                                        // CRITICAL: Preserve restored groupMemberships from current state
                                        groupMemberships: (prevClient.groupMemberships && Array.isArray(prevClient.groupMemberships) && prevClient.groupMemberships.length > 0)
                                            ? [...prevClient.groupMemberships]
                                            : (cachedClient.groupMemberships && Array.isArray(cachedClient.groupMemberships) ? [...cachedClient.groupMemberships] : [])
                                    };
                                }
                                return prevClient;
                            });
                        }
                        // If no previous clients, use cached clients as-is
                        return filteredCachedClients;
                    });
                }
                
                // Show cached leads IMMEDIATELY (this is critical for fast loading!)
                // Only update if data actually changed to prevent unnecessary re-renders
                if (cachedLeads.length > 0) {
                    const normalizedCachedLeads = normalizeLeadStages(cachedLeads);
                    // Use startTransition for non-critical updates to prevent jittering
                    startTransition(() => {
                        setLeads(prevLeads => {
                            // Only update if data actually changed
                            if (prevLeads.length === normalizedCachedLeads.length &&
                                prevLeads.every((l, i) => l?.id === normalizedCachedLeads[i]?.id)) {
                                return prevLeads; // No change, return previous to prevent re-render
                            }
                            return normalizedCachedLeads;
                        });
                        // leadsCount now calculated from leads.length via useMemo
                    });
                }
                
                // Only load opportunities in background if Pipeline view is active
                // Use bulk fetch for much better performance
                if (viewMode === 'pipeline' && window.DatabaseAPI?.getOpportunities && filteredCachedClients.length > 0) {
                    window.DatabaseAPI.getOpportunities()
                        .then(oppResponse => {
                            const allOpportunities = oppResponse?.data?.opportunities || [];
                            const opportunitiesByClient = {};
                            allOpportunities.forEach(opp => {
                                const clientId = opp.clientId || opp.client?.id;
                                if (clientId) {
                                    if (!opportunitiesByClient[clientId]) {
                                        opportunitiesByClient[clientId] = [];
                                    }
                                    opportunitiesByClient[clientId].push(opp);
                                }
                            });
                            // CRITICAL: Use current state (which has groupMemberships from API) not cached data
                            setClients(prevClients => {
                                const updated = prevClients.map(client => {
                                    const opps = opportunitiesByClient[client.id] || client.opportunities || [];
                                    // CRITICAL: Always create new object reference and preserve ALL group data
                                    return {
                                ...client,
                                        opportunities: opps,
                                        // CRITICAL: Preserve groupMemberships from current state (which may have been restored)
                                        parentGroup: client.parentGroup || null,
                                        parentGroupId: client.parentGroupId || null,
                                        parentGroupName: client.parentGroupName || null,
                                        groupMemberships: Array.isArray(client.groupMemberships) ? [...client.groupMemberships] : []
                                    };
                                });
                            safeStorage.setClients(updated);
                                return updated;
                            });
                        })
                        .catch(error => {
                            // Handle error gracefully - don't log for server errors (500s)
                            const isServerError = error?.message?.includes('500') || error?.message?.includes('Server error') || error?.message?.includes('Failed to list opportunities');
                            if (!isServerError) {
                                // Silently fail - cache load error is non-critical
                            }
                        });
                }
            }
            
            // Check if user is logged in
            const token = window.storage?.getToken?.() || null;
            
            if (!token) {
                if (!cachedClients || cachedClients.length === 0) {
                    setClients([]);
                    safeStorage.setClients([]);
                }
                pipelineOpportunitiesLoadedRef.current.clear();
                return;
            }
            
            // Skip API call if we recently called it AND we have data (unless force refresh)
            const now = Date.now();
            const timeSinceLastCall = now - lastApiCallTimestamp;
            
            // Check if cached clients are missing group data - if so, force API call
            // CRITICAL: Always check cachedClients (not clients state) since that's what we're displaying
            const clientsToCheck = cachedClients || [];
            // CRITICAL FIX: Check if ANY client is missing groupMemberships field entirely (undefined/null)
            // OR if all clients have empty groupMemberships arrays (might indicate stale cache)
            // This ensures we always fetch fresh data if cache doesn't have the field
            const hasMissingGroupData = clientsToCheck.length > 0 && (
                clientsToCheck.some(c => {
                    // Check if groupMemberships is completely missing (undefined/null) - this means cache is stale
                    const groupMembershipsMissing = c.groupMemberships === undefined || c.groupMemberships === null;
                    // Also check if it's a string (old cache format) that needs parsing
                    const needsParsing = typeof c.groupMemberships === 'string';
                    // If groupMemberships is missing or needs parsing, we need fresh data
                    return groupMembershipsMissing || needsParsing;
                }) ||
                // Also check if ALL clients have empty groupMemberships arrays - this might indicate stale cache
                // Force refresh if cache is older than 30 seconds to ensure we get fresh group data
                (timeSinceLastCall > 30000 && clientsToCheck.every(c => 
                    Array.isArray(c.groupMemberships) && c.groupMemberships.length === 0
                ))
            );
            
            // Debug logging removed for performance - only log in development mode if needed
            
            // If we have cached clients AND it's been less than 10 seconds since last call, skip API entirely
            // UNLESS cached data is missing group data - then force refresh to get it
            // This prevents unnecessary network requests when data is fresh
            // Group data should come from the main API response, not individual enrichment calls
            // CRITICAL: Always make API call if groupMemberships is missing from cache
            if (!forceRefresh && !hasMissingGroupData && timeSinceLastCall < API_CALL_INTERVAL && (clients.length > 0 || (cachedClients && cachedClients.length > 0))) {
                
                // But still trigger LiveDataSync in background to get updates
                if (window.LiveDataSync?.forceSync) {
                    window.LiveDataSync.forceSync().catch(() => {
                        // Silently fail - background sync is non-critical
                    });
                }
                // Refresh opportunities in background using bulk fetch (much faster)
                if (viewMode === 'pipeline' && window.DatabaseAPI?.getOpportunities) {
                    window.DatabaseAPI.getOpportunities()
                        .then(oppResponse => {
                            const allOpportunities = oppResponse?.data?.opportunities || [];
                            const opportunitiesByClient = {};
                            allOpportunities.forEach(opp => {
                                const clientId = opp.clientId || opp.client?.id;
                                if (clientId) {
                                    if (!opportunitiesByClient[clientId]) {
                                        opportunitiesByClient[clientId] = [];
                                    }
                                    opportunitiesByClient[clientId].push(opp);
                                }
                            });
                            // CRITICAL: Use current state (which has groupMemberships from API) and preserve it
                            setClients(prevClients => {
                                const updated = prevClients.map(client => {
                                    const opps = opportunitiesByClient[client.id] || client.opportunities || [];
                                    // CRITICAL: Always create new object reference and preserve ALL group data
                                return {
                                    ...client,
                                        opportunities: opps,
                                        // CRITICAL: Preserve ALL group data from current state (which may have been restored)
                                    parentGroup: client.parentGroup || null,
                                    parentGroupId: client.parentGroupId || null,
                                    parentGroupName: client.parentGroupName || null,
                                        groupMemberships: Array.isArray(client.groupMemberships) ? [...client.groupMemberships] : []
                                };
                            });
                            safeStorage.setClients(updated);
                                return updated;
                            });
                        })
                        .catch(error => {
                            // Handle error gracefully - don't log for server errors (500s)
                            const isServerError = error?.message?.includes('500') || error?.message?.includes('Server error') || error?.message?.includes('Failed to list opportunities');
                            if (!isServerError) {
                                // Silently fail - background refresh is non-critical
                            }
                        });
                }
                return; // Use cached data, skip API call
            }
            
            // Update last API call timestamp BEFORE making the call (unless force refresh)
            // This prevents race conditions if component re-renders during the API call
            if (!forceRefresh) {
                lastApiCallTimestamp = now;
            } else {
                lastApiCallTimestamp = 0; // Reset to force API call
            }
            
            // API call happens in background after showing cached data
            // Use DatabaseAPI for deduplication and caching benefits
            try {
                const apiStartTime = performance.now();
                // Prefer DatabaseAPI.getClients() for deduplication and caching
                // CRITICAL: Bind the method to preserve 'this' context, otherwise this.makeRequest will fail
                const apiMethod = window.DatabaseAPI?.getClients 
                    ? window.DatabaseAPI.getClients.bind(window.DatabaseAPI)
                    : window.api?.listClients 
                        ? window.api.listClients.bind(window.api)
                        : null;
                if (!apiMethod) {
                    // No API method available - skip API fetch
                    return;
                }
                const res = await apiMethod(forceRefresh);
                const apiEndTime = performance.now();
                // DatabaseAPI returns { data: { clients: [...] } }, while api.listClients might return { data: { clients: [...] } }
                const apiClients = res?.data?.clients || res?.clients || [];
                
                // CRITICAL: Store raw API response in ref for groupMemberships preservation
                latestApiClientsRef.current = apiClients;
                
                // Debug: Check first entity from raw API response
                if (apiClients.length > 0) {
                    const firstRaw = apiClients[0];
                    console.log('🔍 First entity from raw API response:', {
                        name: firstRaw.name,
                        type: firstRaw.type,
                        hasGroupMemberships: !!firstRaw.groupMemberships,
                        groupMembershipsType: typeof firstRaw.groupMemberships,
                        groupMembershipsIsArray: Array.isArray(firstRaw.groupMemberships),
                        groupMembershipsLength: Array.isArray(firstRaw.groupMemberships) ? firstRaw.groupMemberships.length : 0,
                        groupMembershipsValue: JSON.stringify(firstRaw.groupMemberships, null, 2),
                        hasExternalAgent: !!firstRaw.externalAgent,
                        externalAgentId: firstRaw.externalAgentId,
                        externalAgentName: firstRaw.externalAgent?.name,
                        allKeys: Object.keys(firstRaw).slice(0, 20) // First 20 keys to avoid too much output
                    });
                    
                    // Check ALL entities for groups to see if any have them
                    const entitiesWithGroups = apiClients.filter(c => 
                        c.groupMemberships && 
                        Array.isArray(c.groupMemberships) && 
                        c.groupMemberships.length > 0
                    );
                    console.log(`📊 API Response Summary: ${apiClients.length} total, ${entitiesWithGroups.length} with groups`);
                }
                
                // If API returns no clients, use cached data
                if (apiClients.length === 0 && cachedClients && cachedClients.length > 0) {
                    // API returned no clients - using cached data
                    return; // Keep showing cached data
                }
                
                // Use memoized data processor for better performance
                const processStartTime = performance.now();
                
                // Debug logging removed for performance
                
                // Process clients data
                const processedClients = processClientData(apiClients);
                
                // Debug: Check first processed client/lead to see if data is preserved
                if (processedClients.length > 0) {
                    const first = processedClients[0];
                    console.log('🔍 First processed entity after processClientData:', {
                        name: first.name,
                        type: first.type,
                        hasGroupMemberships: !!first.groupMemberships,
                        groupMembershipsLength: Array.isArray(first.groupMemberships) ? first.groupMemberships.length : 0,
                        hasExternalAgent: !!first.externalAgent,
                        externalAgentId: first.externalAgentId,
                        externalAgentName: first.externalAgent?.name
                    });
                }
                
                // Separate clients and leads based on type
                // Include records with type='client' OR null/undefined (legacy clients without type field)
                const clientsOnly = processedClients.filter(c => c.type === 'client' || c.type === null || c.type === undefined);
                const leadsOnly = processedClients.filter(c => c.type === 'lead');
                // Filter out any records with unexpected types (silently)
                // Records with valid types are already separated into clientsOnly and leadsOnly
                
                // Preserve opportunities from cached clients for instant display
                // CRITICAL: Always use tags from API response (client object) - never use cached tags
                const cachedClientsForOpps = safeStorage.getClients() || [];
                const clientsWithCachedOpps = clientsOnly.map(client => {
                    // CRITICAL: Preserve groupMemberships from processed client (from API)
                    const preservedGroupMemberships = client.groupMemberships !== undefined && client.groupMemberships !== null 
                        ? (Array.isArray(client.groupMemberships) ? client.groupMemberships : [])
                        : [];
                    const cachedClient = cachedClientsForOpps.find(c => c.id === client.id);
                    // Start with API client data (which has tags and group data from processClientData)
                    const merged = { ...client };
                    // Preserve opportunities from cache if available (for instant display)
                    if (cachedClient?.opportunities && Array.isArray(cachedClient.opportunities) && cachedClient.opportunities.length > 0) {
                        merged.opportunities = cachedClient.opportunities;
                    }
                    // CRITICAL: Always keep sites from API so "Show sites" list works
                    merged.sites = Array.isArray(client.sites) ? client.sites : (Array.isArray(client.clientSites) ? client.clientSites : (merged.sites || []));
                    // Ensure group data is preserved (should already be in client from processClientData)
                    merged.groupMemberships = (client.groupMemberships !== undefined && client.groupMemberships !== null && Array.isArray(client.groupMemberships))
                        ? client.groupMemberships
                        : [];
                    return merged;
                });
                
                // Debug logging removed for performance
                
                // Show clients immediately with preserved opportunities, sites, and group data
                const finalClients = clientsWithCachedOpps.map(client => ({
                    ...client,
                    sites: Array.isArray(client.sites) ? client.sites : [],
                    groupMemberships: normalizeGroupMemberships(
                        client.groupMemberships,
                        client.companyGroup || client.company_group || client.groups || client.group
                    )
                }));
                // CRITICAL: Ensure groupMemberships is preserved in state
                // Double-check that finalClients have groupMemberships before setting state
                // Use raw API response from ref as the source of truth
                
                // CRITICAL: Use prevClients to preserve restored groupMemberships
                // This ensures groups restored by useEffect are NOT overwritten by API response
                // Use startTransition for background updates to prevent jittering
                startTransition(() => {
                    setClients(prevClients => {
                        // Check if data actually changed before updating
                        if (prevClients.length === finalClients.length &&
                            prevClients.every((c, i) => c?.id === finalClients[i]?.id)) {
                            // IDs match, but check if content changed (groups, services, etc.)
                            const needsUpdate = prevClients.some((prevClient, i) => {
                                const newClient = finalClients[i];
                                // Check if critical fields changed (include sites so "Show sites" gets fresh data)
                                return prevClient.name !== newClient.name ||
                                    prevClient.status !== newClient.status ||
                                    JSON.stringify(prevClient.groupMemberships || []) !== JSON.stringify(newClient.groupMemberships || []) ||
                                    JSON.stringify(prevClient.services || []) !== JSON.stringify(newClient.services || []) ||
                                    JSON.stringify(prevClient.sites || []) !== JSON.stringify(newClient.sites || []);
                            });
                            if (!needsUpdate) {
                                return prevClients; // No meaningful change, prevent re-render
                            }
                        }
                        
                        const verifiedClients = finalClients.map(client => {
                        // CRITICAL: Always find prevClient FIRST to preserve any restored groups
                        const prevClient = prevClients.find(c => c && c.id === client.id);
                        
                    // ALWAYS check raw API response first - it's the source of truth
                    let apiClient = null;
                    let foundInRawApi = false;
                        let groupMembershipsFromApi = null;
                    
                    if (latestApiClientsRef.current && Array.isArray(latestApiClientsRef.current)) {
                        apiClient = latestApiClientsRef.current.find(c => c && c.id === client.id);
                        foundInRawApi = !!apiClient;
                        
                        if (apiClient) {
                            // Check for groupMemberships in various possible structures
                            let groupMemberships = apiClient.groupMemberships;
                            
                            // If it's a string (from JSON serialization), parse it
                            if (typeof groupMemberships === 'string') {
                                try {
                                    groupMemberships = JSON.parse(groupMemberships);
                                } catch (e) {
                                    // Silently fail - groupMemberships parsing error is non-critical
                                    groupMemberships = [];
                                }
                            }
                            
                            if (groupMemberships && Array.isArray(groupMemberships) && groupMemberships.length > 0) {
                                    groupMembershipsFromApi = groupMemberships;
                            }
                        }
                    }
                    
                    // If not in raw API, try processedClients (from API after processing)
                        if (!groupMembershipsFromApi) {
                        apiClient = processedClients.find(c => c && c.id === client.id);
                        if (apiClient) {
                            let groupMemberships = apiClient.groupMemberships;
                            
                            // If it's a string, parse it
                            if (typeof groupMemberships === 'string') {
                                try {
                                    groupMemberships = JSON.parse(groupMemberships);
                                } catch (e) {
                                    // Ignore parse errors
                                }
                            }
                            
                            if (groupMemberships && Array.isArray(groupMemberships) && groupMemberships.length > 0) {
                                    groupMembershipsFromApi = groupMemberships;
                                }
                            }
                        }
                        
                        // CRITICAL: Priority order:
                        // 1. restoredGroupMembershipsRef (if useEffect restored) - HIGHEST PRIORITY! NEVER clear once set!
                        // 2. API data (if available) - source of truth, but only if ref doesn't have restored groups
                        // 3. prevClient.groupMemberships (if restored by useEffect) - NEVER clear once set!
                        // 4. Empty array (only if neither exists AND prevClient never had groups)
                        
                        let finalGroupMemberships = [];
                        
                        // CRITICAL: Check ref FIRST - if groups were restored by useEffect, ALWAYS preserve them
                        // This prevents API handler from overwriting groups even if API response is missing them
                        if (restoredGroupMembershipsRef.current.has(String(client.id))) {
                            const restoredGroups = restoredGroupMembershipsRef.current.get(String(client.id));
                            if (restoredGroups && Array.isArray(restoredGroups) && restoredGroups.length > 0) {
                                finalGroupMemberships = [...restoredGroups];
                            }
                        } else if (groupMembershipsFromApi && Array.isArray(groupMembershipsFromApi) && groupMembershipsFromApi.length > 0) {
                            // Use API data (only if ref doesn't have restored groups)
                            finalGroupMemberships = groupMembershipsFromApi;
                        } else if (prevClient && 
                                   prevClient.groupMemberships && 
                                   Array.isArray(prevClient.groupMemberships) && 
                                   prevClient.groupMemberships.length > 0) {
                            // CRITICAL: ALWAYS preserve restored groups from current state - NEVER clear them!
                            // Even if API doesn't have them in this call, they were restored by useEffect
                            finalGroupMemberships = [...prevClient.groupMemberships];
                        } else if (restoredGroupMembershipsRef.current.has(client.id)) {
                            // CRITICAL: Check ref again here - even if prevClient doesn't have groups, ref might have them
                            // This prevents clearing groups that were restored but prevClient is stale
                            const restoredGroups = restoredGroupMembershipsRef.current.get(client.id);
                            if (restoredGroups && Array.isArray(restoredGroups) && restoredGroups.length > 0) {
                                finalGroupMemberships = [...restoredGroups];
                            } else {
                                finalGroupMemberships = [];
                            }
                        } else if (prevClient && 
                                   prevClient.groupMemberships && 
                                   Array.isArray(prevClient.groupMemberships)) {
                            // Even if empty array, preserve it (don't create new empty array)
                            finalGroupMemberships = [...prevClient.groupMemberships];
                        } else {
                            // No groups found anywhere AND prevClient doesn't exist or never had groups
                            // CRITICAL: Final check of ref before setting empty array
                            if (restoredGroupMembershipsRef.current.has(client.id)) {
                                const restoredGroups = restoredGroupMembershipsRef.current.get(client.id);
                                if (restoredGroups && Array.isArray(restoredGroups) && restoredGroups.length > 0) {
                                    finalGroupMemberships = [...restoredGroups];
                                } else {
                                    finalGroupMemberships = [];
                                }
                            } else {
                                finalGroupMemberships = [];
                            }
                        }
                        
                        return {
                            ...client,
                            groupMemberships: finalGroupMemberships
                        };
                        });
                        
                        return verifiedClients;
                    });
                }); // End startTransition
                
                // RATE-LIMIT FIX: Removed list-level N+1 /api/clients/:id/groups fetches.
                // API already returns groupMemberships (incl. hydration). Per-client fetches caused
                // 429s when combined with sites, contacts, etc. Rely on API data only for list view.
                
                // Only update leads if they're mixed with clients in the API response
                // (Leads typically come from a separate getLeads() endpoint via loadLeads())
                // Use startTransition to prevent jittering during background updates
                if (leadsOnly.length > 0) {
                    startTransition(() => {
                        // API returned leads mixed with clients - use them
                        // Only update if data actually changed
                        setLeads(prevLeads => {
                            if (prevLeads.length === leadsOnly.length &&
                                prevLeads.every((l, i) => l?.id === leadsOnly[i]?.id)) {
                                return prevLeads; // No change, return previous to prevent re-render
                            }
                            return leadsOnly;
                        });
                        // leadsCount now calculated from leads.length via useMemo
                    });
                    // Save to localStorage (non-blocking)
                    if (window.storage?.setLeads) {
                        window.storage.setLeads(leadsOnly);
                    }
                } else {
                    // No leads in clients API - preserve current leads state (from separate getLeads() call or cache)
                    // Don't overwrite leads here - let loadLeads() handle it
                }
                
                // Save clients with preserved opportunities AND group data to localStorage
                // This ensures group data is cached for future loads
                // Use finalClients (which includes parsed groupMemberships) for saving
                // CRITICAL: Ensure groupMemberships is properly serialized and saved
                // Note: We save finalClients, but the state update in startTransition might have additional merging
                // The saved data will be updated again when state actually updates
                const clientsToSave = finalClients.map(client => ({
                    ...client,
                    // Explicitly ensure groupMemberships is an array (not undefined)
                    groupMemberships: Array.isArray(client.groupMemberships) ? client.groupMemberships : []
                }));
                // Save to localStorage asynchronously to not block rendering
                startTransition(() => {
                    safeStorage.setClients(clientsToSave);
                });
                
                // Debug: Verify group data is being saved
                const exxaroInSaved = clientsWithCachedOpps.filter(c => c.name && c.name.toLowerCase().includes('exxaro'));
                // Debug logging removed for performance
                
                // Load fresh opportunities from API in background (only if Pipeline is active)
                // Use bulk fetch instead of per-client calls for much better performance
                if (viewMode === 'pipeline' && window.DatabaseAPI?.getOpportunities) {
                    window.DatabaseAPI.getOpportunities()
                        .then(oppResponse => {
                            const allOpportunities = oppResponse?.data?.opportunities || [];
                            
                            // Group opportunities by clientId
                            const opportunitiesByClient = {};
                            allOpportunities.forEach(opp => {
                                const clientId = opp.clientId || opp.client?.id;
                                if (clientId) {
                                    if (!opportunitiesByClient[clientId]) {
                                        opportunitiesByClient[clientId] = [];
                                    }
                                    opportunitiesByClient[clientId].push(opp);
                                }
                            });
                            
                            // Attach opportunities to their clients
                            // CRITICAL: Use current state (prevClients) to preserve restored groupMemberships
                            // This ensures group data restored by useEffect is NOT overwritten
                            // Use startTransition to prevent jittering during background updates
                            startTransition(() => {
                                setClients(prevClients => {
                                    const updated = prevClients.map(client => {
                                        const opps = opportunitiesByClient[client.id] || client.opportunities || [];
                                        // Only update if opportunities actually changed
                                        const currentOpps = client.opportunities || [];
                                        const oppsChanged = currentOpps.length !== opps.length ||
                                            !currentOpps.every((o, i) => o?.id === opps[i]?.id);
                                        
                                        if (!oppsChanged && client.opportunities) {
                                            return client; // No change, return previous to prevent re-render
                                        }
                                        
                                        // CRITICAL: Always create new object reference and preserve ALL group data from current state
                                        return {
                                            ...client,
                                            opportunities: opps,
                                            // CRITICAL: Preserve group data from current state (which may have been restored by useEffect)
                                            parentGroup: client.parentGroup || null,
                                            parentGroupId: client.parentGroupId || null,
                                            parentGroupName: client.parentGroupName || null,
                                            groupMemberships: Array.isArray(client.groupMemberships) ? [...client.groupMemberships] : []
                                        };
                                    });
                                
                                    const totalOpps = updated.reduce((sum, c) => sum + (c.opportunities?.length || 0), 0);
                                    // Save to localStorage after state update (non-blocking)
                                    if (totalOpps > 0 || updated.length > 0) {
                                        safeStorage.setClients(updated);
                                    }
                                    return updated;
                                });
                            });
                        })
                        .catch(error => {
                            // Handle error gracefully - don't log for server errors (500s)
                            const isServerError = error?.message?.includes('500') || error?.message?.includes('Server error') || error?.message?.includes('Failed to list opportunities');
                            if (!isServerError) {
                                // Silently fail - falling back to cached opportunities
                            }
                            // Keep existing opportunities from cache
                        });
                }
                
                const loadEndTime = performance.now();
            } catch (apiError) {
                // On API error, just keep showing cached data
                if (apiError.message.includes('Unauthorized') || apiError.message.includes('401')) {
                    window.storage?.removeToken?.();
                    window.storage?.removeUser?.();
                }
            }
        } catch (e) {
            // On error, show cached data if available
            const fallbackClients = safeStorage.getClients();
            if (fallbackClients && fallbackClients.length > 0) {
                setClients(fallbackClients);
            }
        } finally {
            // Always reset loading flag
            isClientsLoading = false;
        }
        // Projects are now handled by ProjectsDatabaseFirst component only
        // No localStorage persistence for projects
    };

    // Load projects from database
    const loadProjects = async () => {
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                return;
            }
            
            // Try different API methods in order of preference
            let response = null;
            if (window.DatabaseAPI && typeof window.DatabaseAPI.getProjects === 'function') {
                response = await window.DatabaseAPI.getProjects();
            } else if (window.api && typeof window.api.getProjects === 'function') {
                response = await window.api.getProjects();
            } else {
                // No projects API available - skip project loading
                return;
            }
            
            // Handle different response structures
            let apiProjects = [];
            if (response?.data?.projects) {
                apiProjects = response.data.projects;
            } else if (response?.data?.data?.projects) {
                apiProjects = response.data.data.projects;
            } else if (response?.projects) {
                apiProjects = response.projects;
            } else if (Array.isArray(response?.data)) {
                apiProjects = response.data;
            } else if (Array.isArray(response)) {
                apiProjects = response;
            }
            
            // Ensure projects have both clientId and clientName mapped to client for compatibility
            const normalizedProjects = (Array.isArray(apiProjects) ? apiProjects : []).map(p => ({
                ...p,
                client: p.clientName || p.client || '',
                clientId: p.clientId || null
            }));
            
            setProjects(normalizedProjects);
        } catch (error) {
            // Suppress error logs for database connection errors and server errors (500, 502, 503, 504)
            const errorMessage = error?.message || String(error);
            const isDatabaseError = errorMessage.includes('Database connection failed') ||
                                  errorMessage.includes('unreachable') ||
                                  errorMessage.includes('ECONNREFUSED') ||
                                  errorMessage.includes('ETIMEDOUT');
            const isServerError = errorMessage.includes('500') || 
                                 errorMessage.includes('502') || 
                                 errorMessage.includes('503') || 
                                 errorMessage.includes('504');
            
            if (!isDatabaseError && !isServerError) {
                console.error('❌ Failed to load projects in Clients component:', error);
            }
            // Don't set projects to empty array on error - keep existing if any
        }
    };

    // Load clients, leads, and projects on mount (boot up)
    useEffect(() => {
        // Force refresh clients on mount so list gets fresh data including sites (bypasses cache)
        loadClients(true);
        loadProjects();
        
        // IMMEDIATELY try to load leads from localStorage first (from multiple sources)
        const tryLoadLeadsFromStorage = () => {
            try {
                // Try separate leads key first (most common)
                let cachedLeads = window.storage?.getLeads?.();
                
                // If not found in separate key, try extracting from clients array
                if (!cachedLeads || cachedLeads.length === 0) {
                    const allClients = safeStorage.getClients() || [];
                    cachedLeads = allClients.filter(c => c.type === 'lead');
                }
                
                if (cachedLeads && Array.isArray(cachedLeads) && cachedLeads.length > 0) {
                    const normalizedCachedLeads = normalizeLeadStages(cachedLeads);
                    setLeads(normalizedCachedLeads);
                    setLeadsCount(normalizedCachedLeads.length);
                    if (window.storage?.setLeads) {
                        window.storage.setLeads(normalizedCachedLeads);
                    }
                    return true;
                }
            } catch (e) {
                // Silent fail
            }
            return false;
        };
        
        // Try localStorage first (instant) - this sets the state immediately
        const loadedFromStorage = tryLoadLeadsFromStorage();
        
        // Load leads from API in background (non-blocking, will skip if localStorage check passes)
        // Add a small delay to ensure React state has updated from localStorage
        const loadLeadsOnBoot = async () => {
            // Small delay to let React process the localStorage state update
            await new Promise(resolve => setTimeout(resolve, 50));
            
            try {
                const token = window.storage?.getToken?.();
                if (!token || !window.api?.getLeads) {
                    // If we didn't load from storage, try one more time after a short delay
                    if (!loadedFromStorage) {
                        setTimeout(() => {
                            tryLoadLeadsFromStorage();
                        }, 500);
                    }
                    return;
                }
                
                // loadLeads() will check localStorage again and skip API call if data exists
                // Set timestamp before call to prevent immediate re-throttle
                lastLeadsApiCallTimestamp = Date.now();
                await loadLeads(false);
            } catch (error) {
                console.error('❌ Failed to load leads on boot:', error);
                // Try localStorage as fallback
                if (!loadedFromStorage) {
                    setTimeout(() => {
                        tryLoadLeadsFromStorage();
                    }, 500);
                }
            }
        };
        
        // Load leads from API in background with small delay (non-blocking)
        // loadLeads() will check localStorage first and skip if data already exists
        loadLeadsOnBoot();
        
        // Also retry localStorage after a delay in case DashboardLive stores them
        // PERFORMANCE FIX: Use ref to avoid stale closure
        const leadsLengthRef = leads.length;
        setTimeout(() => {
            if (leadsLengthRef === 0) {
                tryLoadLeadsFromStorage();
            }
        }, 1000);
    }, []); // Empty deps - only run on mount

    // Calculate counts using useMemo to prevent flickering during data loads
    // Removed useEffect that was causing flickering - now calculated directly
    const leadsCount = useMemo(() => leads.length, [leads.length]);
    const clientsCount = useMemo(() => clients.length, [clients.length]);
    const groupsCount = useMemo(() => groups.length, [groups.length]);

    // PERFORMANCE FIX: Only clear cache if explicitly needed (e.g., user logout/login)
    // Removed automatic cache clearing on mount - this was causing slow initial loads
    // Cache will be used for fast initial render, then refreshed in background
    useEffect(() => {
        // Only clear cache if there's a flag indicating we need fresh data
        // (e.g., after logout/login, or explicit refresh action)
        const needsFreshData = sessionStorage.getItem('crm_needs_fresh_data') === 'true';
        
        if (needsFreshData) {
            sessionStorage.removeItem('crm_needs_fresh_data');
            
            // Clear caches only when explicitly needed
            if (window.ClientCache?.clearCache) {
                window.ClientCache.clearCache();
            }
            if (window.DatabaseAPI?.clearCache) {
                window.DatabaseAPI.clearCache('/leads');
                window.DatabaseAPI.clearCache('/clients');
            }
            
            // Reset API call timestamps to force fresh fetch
            lastApiCallTimestamp = 0;
            lastLeadsApiCallTimestamp = 0;
        }
        
        // Load data normally (will use cache if available for fast initial render)
        // The loadClients/loadLeads functions already handle cache intelligently
    }, [clearAllCaches]); // Include clearAllCaches in deps
    
    // One-time cache clear for tags fix - runs once after code update or when forced
    useEffect(() => {
        // Check URL for cache clear parameter
        const urlParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const shouldForceClear = urlParams.has('clearCache') || hashParams.has('clearCache') || 
                                 localStorage.getItem('abcotronics_force_clear_cache') === 'true';
        
        // Check if we've already done the tags refresh once (unless forced)
        const tagsRefreshDone = sessionStorage.getItem('tags_fix_cache_cleared');
        if (!tagsRefreshDone || shouldForceClear) {
            // Mark as done immediately to prevent multiple clears
            sessionStorage.setItem('tags_fix_cache_cleared', 'true');
            localStorage.removeItem('abcotronics_force_clear_cache');
            
            // Clear caches and force refresh after a short delay to ensure everything is loaded
            setTimeout(() => {
                clearAllCaches('both');
                lastApiCallTimestamp = 0;
                lastLeadsApiCallTimestamp = 0;
                
                // Force refresh after cache clear
                setTimeout(() => {
                    loadClients(true).catch(() => {});
                    loadLeads(true).catch(() => {});
                }, 100);
            }, shouldForceClear ? 0 : 1000);
        }
    }, [clearAllCaches]); // Only run once on mount

    // Ensure alphabetical sorting by default when switching to leads view
    useEffect(() => {
        if (viewMode === 'leads') {
            // Default to alphabetical sorting by name if not already set
            if (leadSortField !== 'name' || leadSortDirection !== 'asc') {
                setLeadSortField('name');
                setLeadSortDirection('asc');
            }
        }
    }, [viewMode, leadSortField, leadSortDirection]);

    // Load external agents when viewing clients or leads so both tables can show External Agent
    useEffect(() => {
        const onList = viewMode === 'clients' || viewMode === 'leads';
        if (!onList || externalAgents.length > 0) return;
        const token = window.storage?.getToken?.();
        if (!token) return;
        if (window.RateLimitManager?.isRateLimited?.()) return;
        let cancelled = false;
        setIsLoadingExternalAgents(true);
        fetch('/api/external-agents', {
            headers: { 'Authorization': `Bearer ${token}` },
            credentials: 'include'
        })
            .then(res => {
                if (res.status === 429) {
                    const retryAfter = parseInt(res.headers.get('Retry-After') || '60', 10);
                    window.RateLimitManager?.setRateLimit?.(retryAfter);
                    return Promise.reject(Object.assign(new Error('Too many requests'), { status: 429 }));
                }
                return res.ok ? res.json() : Promise.reject(new Error(res.statusText));
            })
            .then(data => {
                if (cancelled || !data) return;
                const list = data?.data?.externalAgents ?? data?.externalAgents ?? [];
                setExternalAgents(Array.isArray(list) ? list : []);
            })
            .catch(() => { if (!cancelled) setExternalAgents([]); })
            .finally(() => { if (!cancelled) setIsLoadingExternalAgents(false); });
        return () => { cancelled = true; };
    }, [viewMode, externalAgents.length]);

    // When switching to Leads: clear cache and force fresh load so Company Group (and External Agent) are always present.
    // Stale cache can lack groupMemberships and show "None" incorrectly.
    useEffect(() => {
        if (viewMode === 'leads' && !isUserEditingRef.current) {
            if (window.DatabaseAPI?.clearCache) {
                window.DatabaseAPI.clearCache('/leads');
            }
            setTimeout(() => {
                (async () => {
                    try {
                        await loadLeads(true); // Force refresh so list includes groupMemberships
                        if (window.LiveDataSync?.forceSync) {
                            await window.LiveDataSync.forceSync();
                        }
                    } catch (_) { /* avoid unhandled rejection when rate-limited or network fails */ }
                })();
            }, 100);
        }
    }, [viewMode]);

    // PERFORMANCE FIX: Optimize view mode switching - only refresh if data is stale
    // Skip if user is editing to prevent data loss
    // CRITICAL FIX: Removed clients.length from deps to prevent infinite loops
    const hasClientsRef = useRef(false);
    useEffect(() => {
        if (clients.length > 0) {
            hasClientsRef.current = true;
        }
    }, [clients.length]);
    
    // When switching to Clients: clear cache and force fresh load so Company Group (and External Agent) are always present.
    useEffect(() => {
        if (viewMode === 'clients' && !isUserEditingRef.current) {
            if (window.DatabaseAPI?.clearCache) {
                window.DatabaseAPI.clearCache('/clients');
            }
            setTimeout(() => {
                (async () => {
                    try {
                        await loadClients(true); // Force refresh so list includes groupMemberships
                        if (window.LiveDataSync?.forceSync) {
                            await window.LiveDataSync.forceSync();
                        }
                    } catch (_) { /* avoid unhandled rejection when rate-limited or network fails */ }
                })();
            }, 100);
        }
    }, [viewMode]); // Removed clients.length to prevent infinite loops

    // Ensure leads are loaded from localStorage if state is empty
    // Use ref to track if we've already attempted restoration to prevent re-runs
    const leadsRestoredRef = useRef(false);
    useEffect(() => {
        // Only run once on mount or if leads become empty after being populated
        if (leadsRestoredRef.current && leads.length > 0) {
            return; // Already restored and has data, skip
        }
        
        setLeads(prevLeads => {
            if (prevLeads.length === 0) {
                const cachedLeads = window.storage?.getLeads?.();
                if (cachedLeads && Array.isArray(cachedLeads) && cachedLeads.length > 0) {
                    const normalizedCachedLeads = normalizeLeadStages(cachedLeads);
                    setLeadsCount(normalizedCachedLeads.length);
                    leadsRestoredRef.current = true;
                    return normalizedCachedLeads.map(lead => ({
                        ...lead,
                        isStarred: resolveStarredState(lead)
                    }));
                }
            }
            return prevLeads;
        });
    }, [leads.length]);

    // Ensure clients are loaded from localStorage if state is empty  
    useEffect(() => {
        if (clients.length === 0) {
            const cachedClients = safeStorage.getClients();
            if (cachedClients && Array.isArray(cachedClients) && cachedClients.length > 0) {
                const filteredClients = cachedClients
                    .filter(c => c.type === 'client' || !c.type)
                    .map(client => {
                        // CRITICAL: Check ref FIRST - if groups were restored, preserve them
                        let baseGroupMemberships = null;
                        if (restoredGroupMembershipsRef.current.has(client.id)) {
                            const restoredGroups = restoredGroupMembershipsRef.current.get(client.id);
                            if (restoredGroups && Array.isArray(restoredGroups) && restoredGroups.length > 0) {
                                baseGroupMemberships = [...restoredGroups];
                            }
                        }

                        if (baseGroupMemberships === null) {
                            baseGroupMemberships = client.groupMemberships;
                        }

                        const finalGroupMemberships = normalizeGroupMemberships(
                            baseGroupMemberships,
                            client.companyGroup || client.company_group || client.groups || client.group
                        );
                        
                        return {
                        ...client,
                            isStarred: resolveStarredState(client),
                            // CRITICAL: Preserve restored groups from ref if available
                            groupMemberships: finalGroupMemberships
                        };
                    });
                if (filteredClients.length > 0) {
                    setClients(filteredClients);
                }
            }
        }
    }, [clients.length]);

    // NO MORE SYNCING! Modals fetch their own fresh data
    
    // Live sync: subscribe to real-time updates so clients stay fresh without manual refresh
    // CRITICAL: Skip updates if user is actively editing to prevent overwriting input
    useEffect(() => {
        const mapDbClient = (c) => {
            const isLead = c.type === 'lead';
            let status = c.status;
            const normalizedIdentity = normalizeEntityId(c, isLead ? 'lead' : 'client');
            const normalizedId = String(normalizedIdentity.id);
            const stage = resolvePipelineStage(c);

            // Entity ID normalized (generated fallback if needed)
            if (normalizedIdentity.generated && process.env.NODE_ENV === 'development') {
                // Only log in development mode
            }

            const parseArrayField = (value, fieldName) => {
                if (Array.isArray(value)) {
                    return value;
                }

                if (typeof value === 'string' && value.trim() !== '') {
                    try {
                        const parsed = JSON.parse(value);
                        return Array.isArray(parsed) ? parsed : [];
                    } catch (error) {
                        // Failed to parse JSON field - return empty array
                        return [];
                    }
                }

                return [];
            };

            const parseObjectField = (value, fieldName, fallback) => {
                if (value && typeof value === 'object' && !Array.isArray(value)) {
                    return value;
                }

                if (typeof value === 'string' && value.trim() !== '') {
                    try {
                        const parsed = JSON.parse(value);
                        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                            return parsed;
                        }
                    } catch (error) {
                        // Failed to parse JSON field - use fallback
                    }
                }

                return fallback;
            };

            // Convert status based on type
            if (isLead) {
                // For leads: preserve status as-is (Potential, Active, Disinterested)
                status = c.status || 'Potential';
            } else {
                // For clients: convert lowercase to capitalized
                if (c.status === 'active') status = 'Active';
                else if (c.status === 'inactive') status = 'Inactive';
                else status = c.status || 'Inactive';
            }

            return {
                id: normalizedId,
                name: c.name,
                status,
                stage,
                industry: c.industry || 'Other',
                type: c.type, // Preserve as-is - null types will be filtered out
                revenue: c.revenue || 0,
                lastContact: new Date(c.updatedAt || c.createdAt || Date.now()).toISOString().split('T')[0],
                address: c.address || '',
                website: c.website || '',
                notes: c.notes || '',
                contacts: parseArrayField(c.contacts, 'contacts'),
                followUps: parseArrayField(c.followUps, 'followUps'),
                projectIds: parseArrayField(c.projectIds, 'projectIds'),
                comments: parseArrayField(c.comments, 'comments'),
                sites: parseArrayField(c.sites ?? c.clientSites, 'sites'),
                opportunities: parseArrayField(c.opportunities, 'opportunities'),
                contracts: parseArrayField(c.contracts, 'contracts'),
                activityLog: parseArrayField(c.activityLog, 'activityLog'),
                services: parseArrayField(c.services, 'services'),
                groupMemberships: normalizeGroupMemberships(
                    c.groupMemberships,
                    c.companyGroup || c.company_group || c.groups || c.group
                ),
                billingTerms: parseObjectField(c.billingTerms, 'billingTerms', {
                    paymentTerms: 'Net 30',
                    billingFrequency: 'Monthly',
                    currency: 'ZAR',
                    retainerAmount: 0,
                    taxExempt: false,
                    notes: ''
                }),
                ...(normalizedIdentity.generated ? { tempId: normalizedId, legacyId: c.id ?? c.clientId ?? null } : {}),
                isStarred: resolveStarredState(c),
                createdAt: c.createdAt,
                updatedAt: c.updatedAt,
                // CRITICAL: Preserve externalAgentId and externalAgent to prevent data loss
                externalAgentId: c.externalAgentId || null,
                externalAgent: c.externalAgent || null
            };
        };

        const subscriberId = 'clients-screen-live-sync';
        const handler = async (message) => {
            // CRITICAL: FIRST CHECK - If ANY form is open, completely ignore ALL messages
            if (isFormOpenRef.current) {
                return;
            }
            
            // CRITICAL: Ignore all messages if LiveDataSync is not running (stopped)
            if (window.LiveDataSync && !window.LiveDataSync.isRunning) {
                return;
            }
            
            // CRITICAL: Skip LiveDataSync updates if user is editing OR auto-saving
            // Use REF for synchronous check (state might lag)
            if (isUserEditingRef.current || isAutoSavingRef.current) {
                return;
            }
            if (message?.type === 'data' && Array.isArray(message.data)) {
                // CRITICAL: Ignore LiveDataSync updates when Add Client/Lead forms are open
                // Check this FIRST before any data processing to prevent any possibility of overwrites
                const currentViewMode = viewModeRef.current;
                const isAddClientForm = currentViewMode === 'client-detail' && selectedClientRef.current === null;
                const isAddLeadForm = currentViewMode === 'lead-detail' && selectedLeadRef.current === null;
                const isDetailView = currentViewMode === 'client-detail' || currentViewMode === 'lead-detail';
                
                // CRITICAL: Block ALL data updates when ANY detail modal is open (new or existing)
                // This is the PRIMARY guard to prevent overwrites
                if (isAddClientForm || isAddLeadForm || isDetailView) {
                    return; // Ignore all updates when forms are open
                }
                
                if (message.dataType === 'clients') {
                    // Check if data changed to prevent unnecessary updates
                    const dataHash = JSON.stringify(message.data);
                    const now = Date.now();
                    
                    // Log incoming update
                    
                    if (dataHash === lastLiveDataClientsHash && (now - lastLiveDataSyncTime) < LIVE_SYNC_THROTTLE) {
                        return;
                    }
                    
                    // Filter to only include actual clients (exclude leads and null types)
                    const processed = message.data.map(mapDbClient).filter(c => c.type === 'client');
                    
                    // CRITICAL: Preserve opportunities from current clients state to prevent them from disappearing
                    // This ensures opportunities loaded from Pipeline tab don't get wiped by LiveDataSync updates
                    // Use ref to get the latest clients state (not stale closure)
                    const currentClients = clientsRef.current.length > 0 ? clientsRef.current : (safeStorage.getClients() || []);
                    const opportunitiesByClientId = {};
                    currentClients.forEach(client => {
                        if (client.opportunities && Array.isArray(client.opportunities) && client.opportunities.length > 0) {
                            opportunitiesByClientId[client.id] = client.opportunities;
                        }
                    });
                    
                    // Load opportunities for clients from LiveDataSync
                    // Use bulk fetch for much better performance when Pipeline view is active
                    // CRITICAL: Use viewModeRef.current to get the current viewMode (not stale closure value)
                    const currentViewMode = viewModeRef.current;
                    if (currentViewMode === 'pipeline' && window.DatabaseAPI?.getOpportunities) {
                        const clientsNeedingOpps = [];
                        processed.forEach((client) => {
                            if (!client?.id) {
                                return;
                            }
                            const existingOpps = opportunitiesByClientId[client.id] || [];
                            const signature = buildOpportunitiesSignature(existingOpps);
                            const cacheEntry = pipelineOpportunitiesLoadedRef.current.get(client.id);

                            if (!cacheEntry || cacheEntry.signature !== signature) {
                                clientsNeedingOpps.push(client);
                            }
                        });

                        if (clientsNeedingOpps.length === 0) {
                            // CRITICAL: Preserve groupMemberships and externalAgentId from current state
                            const currentClients = clientsRef.current.length > 0 ? clientsRef.current : clients;
                            const clientsWithPreservedOpps = processed.map((client) => {
                                const existingOpps = opportunitiesByClientId[client.id] || [];
                                const signature = buildOpportunitiesSignature(existingOpps);
                                if (client?.id) {
                                    pipelineOpportunitiesLoadedRef.current.set(client.id, { signature });
                                }
                                const existingClient = currentClients.find(c => c.id === client.id);
                                return {
                                    ...client,
                                    opportunities: existingOpps,
                                    // Preserve groupMemberships if incoming data doesn't have them or is empty
                                    groupMemberships: (client.groupMemberships && 
                                        Array.isArray(client.groupMemberships) && 
                                        client.groupMemberships.length > 0)
                                        ? client.groupMemberships
                                        : (existingClient?.groupMemberships || []),
                                    // Preserve externalAgentId if incoming data doesn't have it
                                    externalAgentId: client.externalAgentId || existingClient?.externalAgentId || null,
                                    // Preserve externalAgent if incoming data doesn't have it
                                    externalAgent: client.externalAgent || existingClient?.externalAgent || null
                                };
                            });
                            const totalPreservedOpps = clientsWithPreservedOpps.reduce((sum, c) => sum + (c.opportunities?.length || 0), 0);
                            if (totalPreservedOpps > 0) {
                            }
                            setClients(clientsWithPreservedOpps);
                            safeStorage.setClients(clientsWithPreservedOpps);
                            lastLiveDataClientsHash = dataHash;
                            lastLiveDataSyncTime = now;
                            return;
                        }

                        try {
                            const oppResponse = await window.DatabaseAPI.getOpportunities();
                            const allOpportunities = oppResponse?.data?.opportunities || [];
                            const newOpportunitiesByClient = {};
                            allOpportunities.forEach(opp => {
                                const clientId = opp.clientId || opp.client?.id;
                                if (clientId) {
                                    if (!newOpportunitiesByClient[clientId]) {
                                        newOpportunitiesByClient[clientId] = [];
                                    }
                                    newOpportunitiesByClient[clientId].push(opp);
                                }
                            });
                            // Merge: use new opportunities if available, otherwise preserve existing ones
                            // CRITICAL: Always preserve existing opportunities even if API returns empty/fewer
                            let hasChanges = false;
                            const clientsWithOpportunities = processed.map((client) => {
                                if (!client?.id) {
                                    return {
                                        ...client,
                                        opportunities: opportunitiesByClientId[client.id] || []
                                    };
                                }

                                const apiOpps = newOpportunitiesByClient[client.id] || [];
                                const existingOpps = opportunitiesByClientId[client.id] || [];
                                const effectiveOpps = apiOpps.length > 0 ? apiOpps : existingOpps;
                                const signature = buildOpportunitiesSignature(effectiveOpps);
                                pipelineOpportunitiesLoadedRef.current.set(client.id, { signature });

                                if (!haveOpportunitiesChanged(existingOpps, effectiveOpps)) {
                                    // CRITICAL: Preserve groupMemberships and externalAgentId from current state
                                    const existingClient = clientsRef.current.find(c => c.id === client.id);
                                    return {
                                        ...client,
                                        opportunities: existingOpps,
                                        // Preserve groupMemberships if incoming data doesn't have them or is empty
                                        groupMemberships: (client.groupMemberships && 
                                            Array.isArray(client.groupMemberships) && 
                                            client.groupMemberships.length > 0)
                                            ? client.groupMemberships
                                            : (existingClient?.groupMemberships || []),
                                        // Preserve externalAgentId if incoming data doesn't have it
                                        externalAgentId: client.externalAgentId || existingClient?.externalAgentId || null,
                                        // Preserve externalAgent if incoming data doesn't have it
                                        externalAgent: client.externalAgent || existingClient?.externalAgent || null
                                    };
                                }

                                hasChanges = true;
                                
                                // CRITICAL: Preserve groupMemberships and externalAgentId from current state
                                const existingClient = clientsRef.current.find(c => c.id === client.id);
                                return {
                                    ...client,
                                    opportunities: effectiveOpps,
                                    // Preserve groupMemberships if incoming data doesn't have them or is empty
                                    groupMemberships: (client.groupMemberships && 
                                        Array.isArray(client.groupMemberships) && 
                                        client.groupMemberships.length > 0)
                                        ? client.groupMemberships
                                        : (existingClient?.groupMemberships || []),
                                    // Preserve externalAgentId if incoming data doesn't have it
                                    externalAgentId: client.externalAgentId || existingClient?.externalAgentId || null,
                                    // Preserve externalAgent if incoming data doesn't have it
                                    externalAgent: client.externalAgent || existingClient?.externalAgent || null
                                };
                            });
                            const totalOpps = clientsWithOpportunities.reduce((sum, c) => sum + (c.opportunities?.length || 0), 0);
                            setClients(clientsWithOpportunities);
                            safeStorage.setClients(clientsWithOpportunities);
                        } catch (error) {
                            // Handle error gracefully - don't log for server errors (500s)
                            // Silently fail for server errors (500s) - opportunities preserved from current state
                            const isServerError = error?.message?.includes('500') || error?.message?.includes('Server error') || error?.message?.includes('Failed to list opportunities');
                            // Don't log - opportunities are preserved from current state
                            // Preserve existing opportunities even when API call fails
                            // CRITICAL: Also preserve groupMemberships and externalAgentId
                            const currentClients = clientsRef.current.length > 0 ? clientsRef.current : clients;
                            const clientsWithPreservedOpps = processed.map(client => {
                                const existingClient = currentClients.find(c => c.id === client.id);
                                return {
                                    ...client,
                                    opportunities: opportunitiesByClientId[client.id] || [],
                                    // Preserve groupMemberships if incoming data doesn't have them or is empty
                                    groupMemberships: (client.groupMemberships && 
                                        Array.isArray(client.groupMemberships) && 
                                        client.groupMemberships.length > 0)
                                        ? client.groupMemberships
                                        : (existingClient?.groupMemberships || []),
                                    // Preserve externalAgentId if incoming data doesn't have it
                                    externalAgentId: client.externalAgentId || existingClient?.externalAgentId || null,
                                    // Preserve externalAgent if incoming data doesn't have it
                                    externalAgent: client.externalAgent || existingClient?.externalAgent || null
                                };
                            });
                            setClients(clientsWithPreservedOpps);
                            safeStorage.setClients(clientsWithPreservedOpps);
                            clientsNeedingOpps.forEach((client) => {
                                if (client?.id) {
                                    pipelineOpportunitiesLoadedRef.current.delete(client.id);
                                }
                            });
                        }
                    } else {
                        // Not in pipeline mode - preserve opportunities from current state
                        // CRITICAL: Always preserve opportunities to prevent them from disappearing
                        const clientsWithPreservedOpps = processed.map(client => ({
                            ...client,
                            opportunities: opportunitiesByClientId[client.id] || []
                        }));
                        const totalPreservedOpps = clientsWithPreservedOpps.reduce((sum, c) => sum + (c.opportunities?.length || 0), 0);
                        if (totalPreservedOpps > 0) {
                        }
                        setClients(clientsWithPreservedOpps);
                        safeStorage.setClients(clientsWithPreservedOpps);
                    }
                    
                    lastLiveDataClientsHash = dataHash;
                    lastLiveDataSyncTime = now;
                }
                if (message.dataType === 'leads') {
                    // CRITICAL: Double-check that we're not in a form before updating leads
                    const currentViewMode = viewModeRef.current;
                    const isAddLeadForm = currentViewMode === 'lead-detail' && selectedLeadRef.current === null;
                    const isDetailView = currentViewMode === 'lead-detail';
                    
                    // CRITICAL: Never update leads when modal is open (prevents overwriting form data)
                    if (isAddLeadForm || isDetailView) {
                        return; // Don't update leads when modal is open
                    }
                    
                    const processedLeads = message.data.map(mapDbClient).filter(c => (c.type || 'lead') === 'lead');
                    
                    // CRITICAL: Preserve groupMemberships and externalAgentId from current state
                    // LiveDataSync might not include these fields, so preserve existing values
                    const currentLeads = leadsRef.current.length > 0 ? leadsRef.current : leads;
                    const leadsWithPreservedData = processedLeads.map(processedLead => {
                        const existingLead = currentLeads.find(l => l.id === processedLead.id);
                        if (existingLead) {
                            return {
                                ...processedLead,
                                // Preserve groupMemberships if incoming data doesn't have them or is empty
                                groupMemberships: (processedLead.groupMemberships && 
                                    Array.isArray(processedLead.groupMemberships) && 
                                    processedLead.groupMemberships.length > 0)
                                    ? processedLead.groupMemberships
                                    : (existingLead.groupMemberships || []),
                                // Preserve externalAgentId if incoming data doesn't have it
                                externalAgentId: processedLead.externalAgentId || existingLead.externalAgentId || null,
                                // Preserve externalAgent if incoming data doesn't have it
                                externalAgent: processedLead.externalAgent || existingLead.externalAgent || null
                            };
                        }
                        return processedLead;
                    });
                    
                    setLeads(leadsWithPreservedData);
                    // leadsCount now calculated from leads.length via useMemo
                    // Also update localStorage for consistency
                    if (window.storage?.setLeads) {
                        try {
                            window.storage.setLeads(leadsWithPreservedData);
                        } catch (e) {
                            // Silently fail - localStorage persistence is non-critical
                        }
                    }
                }
            }
        };

        try {
            if (window.storage?.getToken?.()) {
                window.LiveDataSync?.start?.();
            }
        } catch (_e) {}

        window.LiveDataSync?.subscribe?.(subscriberId, handler);
        return () => {
            window.LiveDataSync?.unsubscribe?.(subscriberId);
        };
    }, []);


    // Manual refresh/clear removed to ensure always-live data

    // Debug function to check client data consistency
    const debugClientData = () => {
        
        const localStorageClients = safeStorage.getClients();
        if (localStorageClients) {
        }
        
        const cachedClients = window.ClientCache?.getClients();
        if (cachedClients) {
        }
        
        const currentUser = window.storage?.getUser?.();
        
    };

    // Make debug function available globally
    window.debugClientData = debugClientData;

    // Load leads from database only
    const loadLeads = async (forceRefresh = false) => {
        // On first load, always force refresh to get fresh data with groups
        if (isFirstLoad) {
            forceRefresh = true;
        }
        
        // Prevent concurrent calls
        if (isLeadsLoading) {
            return;
        }
        
        try {
            isLeadsLoading = true;
            
            // Even for force refresh, respect minimum interval to prevent rate limiting
            if (forceRefresh) {
                const now = Date.now();
                const timeSinceLastCall = now - lastLeadsApiCallTimestamp;
                if (timeSinceLastCall < FORCE_REFRESH_MIN_INTERVAL) {
                    // Wait for the remaining time
                    await new Promise(resolve => setTimeout(resolve, FORCE_REFRESH_MIN_INTERVAL - timeSinceLastCall));
                }
            }
            
            // Check localStorage first to avoid unnecessary API calls if data is already loaded
            if (!forceRefresh) {
                const cachedLeads = window.storage?.getLeads?.();
                
                // If we have leads in localStorage but state is empty, load them immediately
                if (cachedLeads && Array.isArray(cachedLeads) && cachedLeads.length > 0 && leads.length === 0) {
                    // Use functional setState to ensure it updates even if leads is empty
                    const normalizedCachedLeads = normalizeLeadStages(cachedLeads).map(lead => ({
                        ...lead,
                        isStarred: resolveStarredState(lead)
                    }));
                    setLeads(prevLeads => {
                        if (prevLeads.length === 0) {
                            return normalizedCachedLeads;
                        }
                        return prevLeads;
                    });
                    // leadsCount now calculated from leads.length via useMemo
                }
                
                const now = Date.now();
                const timeSinceLastCall = now - lastLeadsApiCallTimestamp;
                
                // Check if cached leads are missing tags - if so, always fetch from API
                // IMPORTANT: Check the original cached data, not the state (which may have empty arrays set)
                // Check if we should skip API call:
                // 1. If we have leads in state AND recent API call - skip
                // 2. If we have leads in localStorage (just loaded above) AND recent API call - skip
                const hasLeadsInState = leads.length > 0;
                const hasLeadsInCache = cachedLeads && Array.isArray(cachedLeads) && cachedLeads.length > 0;
                
                if (!forceRefresh && timeSinceLastCall < API_CALL_INTERVAL && (hasLeadsInState || hasLeadsInCache)) {
                    const leadCount = hasLeadsInState ? leads.length : cachedLeads.length;
                    
                    // But still trigger LiveDataSync in background to get updates
                    if (window.LiveDataSync?.forceSync) {
                        window.LiveDataSync.forceSync().catch(err => {
                            console.warn('⚠️ Background sync failed:', err);
                        });
                    }
                    return; // Use cached data, skip API call
                }
            } else {
                // Force refresh - clear all caches and bypass timestamp check
                console.log('🔄 Force refreshing leads - clearing all caches...');
                if (window.dataManager?.invalidate) {
                    window.dataManager.invalidate('leads');
                }
                // Clear DatabaseAPI cache
                if (window.DatabaseAPI?.clearCache) {
                    window.DatabaseAPI.clearCache('/leads');
                    window.DatabaseAPI.clearCache('/clients');
                }
                // Clear localStorage cache to ensure fresh data
                if (window.storage?.removeLeads) {
                    window.storage.removeLeads();
                }
                // Also clear clients cache in case lead was converted
                if (window.storage?.removeClients) {
                    // Don't clear all clients, just note that we need fresh data
                }
                lastLeadsApiCallTimestamp = 0; // Reset to force API call
                lastApiCallTimestamp = 0; // Also reset clients timestamp
            }
            
            const token = window.storage?.getToken?.();
            const hasApi = window.api && typeof window.api.getLeads === 'function';
            
            // Skip if not authenticated or API not ready
            if (!token || !hasApi) {
                isLeadsLoading = false;
                return;
            }
            
            if (forceRefresh) {
            }
            
            // Use DatabaseAPI.getLeads if available (supports forceRefresh), otherwise fall back to api.getLeads
            // CRITICAL: Bind the method to preserve 'this' context, or call it directly on the object
            let apiResponse;
            if (window.DatabaseAPI?.getLeads) {
                apiResponse = await window.DatabaseAPI.getLeads(forceRefresh);
            } else if (window.api?.getLeads) {
                apiResponse = await window.api.getLeads();
            } else {
                console.warn('⚠️ No API method available for fetching leads');
                return;
            }
            const rawLeads = apiResponse?.data?.leads || apiResponse?.leads || [];
            
            // Debug: Log raw API response to see what we're getting
            console.log('🔍 Raw API response for leads:');
            console.log('  - Total leads:', rawLeads.length);
            if (rawLeads.length > 0) {
                // Check ALL leads for groupMemberships, not just first
                rawLeads.forEach((lead, index) => {
                    if (lead.groupMemberships && Array.isArray(lead.groupMemberships) && lead.groupMemberships.length > 0) {
                        console.log(`✅ Lead ${index + 1} (${lead.name}) HAS groupMemberships:`, JSON.stringify(lead.groupMemberships, null, 2));
                    }
                });
                
                const firstLead = rawLeads[0];
                console.log('  - First lead name:', firstLead.name);
                console.log('  - First lead ID:', firstLead.id);
                console.log('  - First lead groupMemberships:', JSON.stringify(firstLead.groupMemberships, null, 2));
                console.log('  - First lead has groupMemberships:', !!firstLead.groupMemberships);
                console.log('  - First lead groupMemberships type:', typeof firstLead.groupMemberships);
                console.log('  - First lead groupMemberships isArray:', Array.isArray(firstLead.groupMemberships));
                if (firstLead.groupMemberships && Array.isArray(firstLead.groupMemberships)) {
                    console.log('  - First lead groupMemberships length:', firstLead.groupMemberships.length);
                    firstLead.groupMemberships.forEach((gm, i) => {
                        console.log(`    [${i}] group:`, gm.group?.name || 'no name', 'id:', gm.group?.id || 'no id');
                    });
                }
            }
            
            // DEBUG: Check if any leads have tags in API response
            // DEBUG: Log lead details and ownerIds for visibility debugging
            const currentUser = window.storage?.getUser?.();
            const userEmail = currentUser?.email || 'unknown';
            
            if (rawLeads.length > 0) {
                
                // Log ReitCoal specifically to verify stage field
                const reitcoulLead = rawLeads.find(l => l.name && l.name.toLowerCase().includes('reit'));
                if (reitcoulLead) {
                }
                
                // Leads loaded successfully
            } else {
                // API returned 0 leads - might indicate visibility issue, but don't log in production
            }
            
            // Map database fields to UI expected format with JSON parsing
            const mappedLeads = rawLeads.map(lead => {
                const normalized = normalizeEntityId(lead, 'lead');
                const normalizedId = String(normalized.id);

                // Lead ID normalized (generated fallback if needed)
                // Debug: Log groupMemberships for first lead to verify API data
                if (rawLeads.indexOf(lead) === 0) {
                    console.log('🔍 First lead from API:', lead.name);
                    console.log('  - Lead ID:', lead.id);
                    console.log('  - groupMemberships:', JSON.stringify(lead.groupMemberships, null, 2));
                    console.log('  - companyGroup:', lead.companyGroup);
                    console.log('  - hasGroupMemberships:', !!lead.groupMemberships);
                    console.log('  - groupMemberships type:', typeof lead.groupMemberships);
                    console.log('  - groupMemberships isArray:', Array.isArray(lead.groupMemberships));
                    console.log('  - All lead keys:', Object.keys(lead));
                }

                const parseArrayField = (value, fallback = []) => {
                    if (Array.isArray(value)) {
                        return value;
                    }

                    if (typeof value === 'string' && value.trim() !== '') {
                        try {
                            const parsed = JSON.parse(value);
                            return Array.isArray(parsed) ? parsed : fallback;
                        } catch (_error) {
                            return fallback;
                        }
                    }

                    return fallback;
                };

                const parseObjectField = (value, fallback = {}) => {
                    if (value && typeof value === 'object' && !Array.isArray(value)) {
                        return value;
                    }

                    if (typeof value === 'string' && value.trim() !== '') {
                        try {
                            const parsed = JSON.parse(value);
                            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                                return parsed;
                            }
                        } catch (_error) {
                            return fallback;
                        }
                    }

                    return fallback;
                };

                const coerceDate = (value) => {
                    if (!value) {
                        return null;
                    }

                    const parsed = new Date(value);
                    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().split('T')[0];
                };

                const firstContact = lead.firstContactDate || coerceDate(lead.createdAt) || new Date().toISOString().split('T')[0];
                const lastContact = lead.lastContact || coerceDate(lead.updatedAt) || new Date().toISOString().split('T')[0];

                return {
                    id: normalizedId,
                    ...(normalized.generated ? { tempId: normalizedId, legacyId: lead.id ?? lead.leadId ?? null } : {}),
                    name: lead.name || '',
                    industry: lead.industry || 'Other',
                    status: lead.status || 'Potential',
                    stage: resolvePipelineStage(lead),
                    source: lead.source || 'Website',
                    value: lead.value || lead.revenue || 0,
                    probability: lead.probability || 0,
                    isStarred: resolveStarredState(lead),
                    firstContactDate: firstContact,
                    lastContact,
                    address: lead.address || '',
                    website: lead.website || '',
                    notes: lead.notes || '',
                    contacts: parseArrayField(lead.contacts),
                    followUps: parseArrayField(lead.followUps),
                    projectIds: parseArrayField(lead.projectIds),
                    comments: parseArrayField(lead.comments),
                    activityLog: parseArrayField(lead.activityLog),
                    sites: parseArrayField(lead.sites),
                    contracts: parseArrayField(lead.contracts),
                    billingTerms: parseObjectField(lead.billingTerms, {
                        paymentTerms: 'Net 30',
                        billingFrequency: 'Monthly',
                        currency: 'ZAR',
                        retainerAmount: 0,
                        taxExempt: false,
                        notes: ''
                    }),
                    proposals: parseArrayField(lead.proposals),
                    services: parseArrayField(lead.services),
                    groupMemberships: (() => {
                        // CRITICAL: Preserve groupMemberships exactly as they come from API
                        // The API returns Prisma relation data with group objects
                        if (lead.groupMemberships && Array.isArray(lead.groupMemberships) && lead.groupMemberships.length > 0) {
                            // API has groupMemberships - preserve them exactly
                            return lead.groupMemberships.map(m => {
                                if (m && typeof m === 'object' && m.group) {
                                    return {
                                        ...m,
                                        group: m.group ? {
                                            id: m.group.id || null,
                                            name: m.group.name || null,
                                            type: m.group.type || null
                                        } : null
                                    };
                                }
                                return m;
                            });
                        }
                        
                        // Fallback to normalization for legacy data
                        return normalizeGroupMemberships(
                            lead.groupMemberships,
                            lead.companyGroup || lead.company_group || lead.groups || lead.group
                        );
                    })(),
                    tags: (() => {
                        // Handle tags: API returns either nested ClientTag objects or already-extracted Tag objects
                        if (!lead.tags || !Array.isArray(lead.tags)) {
                            return [];
                        }
                        // Extract tags from nested structure if needed: [{ tag: { id, name, color } }] -> [{ id, name, color }]
                        return lead.tags
                            .map(t => {
                                // If it's already a Tag object with id and name, use it
                                if (t && typeof t === 'object' && t.id && t.name) {
                                    return {
                                        id: t.id,
                                        name: t.name,
                                        color: t.color || '#3B82F6',
                                        description: t.description || ''
                                    };
                                }
                                // If it's nested in a tag property, extract it
                                if (t && typeof t === 'object' && t.tag && typeof t.tag === 'object') {
                                    return {
                                        id: t.tag.id,
                                        name: t.tag.name,
                                        color: t.tag.color || '#3B82F6',
                                        description: t.tag.description || ''
                                    };
                                }
                                // If it's just a string, convert to object
                                if (typeof t === 'string' && t.trim()) {
                                    return {
                                        id: null,
                                        name: t,
                                        color: '#3B82F6',
                                        description: ''
                                    };
                                }
                                return null;
                            })
                            .filter(Boolean);
                    })(),
                    type: lead.type || 'lead',
                    ownerId: lead.ownerId || null,
                    createdAt: lead.createdAt,
                    updatedAt: lead.updatedAt,
                    // CRITICAL: Preserve externalAgentId and externalAgent to prevent data loss
                    externalAgentId: lead.externalAgentId || null,
                    externalAgent: lead.externalAgent || null
                };
            });
                
            // Debug: Verify groupMemberships are included before setting state
            if (mappedLeads.length > 0) {
                const firstLead = mappedLeads[0];
                console.log('🔍 Setting leads state - first lead:', firstLead.name);
                console.log('  - Lead ID:', firstLead.id);
                console.log('  - hasGroupMemberships:', !!firstLead.groupMemberships);
                console.log('  - groupMemberships:', JSON.stringify(firstLead.groupMemberships, null, 2));
                console.log('  - groupMemberships length:', firstLead.groupMemberships?.length || 0);
                const groupNames = resolveGroupNames(firstLead);
                console.log('  - Resolved group names:', groupNames);
                console.log('  - Will display:', groupNames.length > 0 ? groupNames.join(', ') : 'None');
            }
                
            setLeads(mappedLeads);
            // RATE-LIMIT FIX: Removed list-level N+1 /api/clients/:id/groups for leads.
            // Leads API returns groupMemberships. Per-lead fetches contributed to 429s.
            // leadsCount now calculated from leads.length via useMemo
            
            // Log count update for debugging
            
            // Debug: Check processed leads for tags
            // Persist leads to localStorage for fast loading on next boot
            if (window.storage?.setLeads) {
                try {
                    window.storage.setLeads(mappedLeads);
                } catch (e) {
                    console.warn('⚠️ Failed to save leads to localStorage:', e);
                }
            }
            
            if (forceRefresh) {
                // Count leads by status for accurate reporting
                const statusCounts = mappedLeads.reduce((acc, lead) => {
                    acc[lead.status] = (acc[lead.status] || 0) + 1;
                    return acc;
                }, {});
            }
            
            // Update timestamp after successful API call
            lastLeadsApiCallTimestamp = Date.now();
        } catch (error) {
            // Keep existing leads on error, don't clear them
            console.error('❌ Error loading leads:', error);
            // Still update timestamp to prevent immediate retry spam
            lastLeadsApiCallTimestamp = Date.now();
        } finally {
            isLeadsLoading = false;
        }
    };

    // When user switches to Leads tab, force refresh once so we get leads with clientSites (site child rows)
    useEffect(() => {
        if (viewMode !== 'leads') return;
        if (hasForceRefreshedLeadsForSitesRef.current) return;
        hasForceRefreshedLeadsForSitesRef.current = true;
        loadLeads(true);
    }, [viewMode]);

    // Listen for storage changes to refresh clients (DISABLED - was causing infinite loop)
    // useEffect(() => {
    //     const handleStorageChange = () => {
    //         loadClients();
    //     };
    //     
    //     window.addEventListener('storage', handleStorageChange);
    //     // Also listen for custom events from other components
    //     window.addEventListener('clientsUpdated', handleStorageChange);
    //     
    //     return () => {
    //         window.removeEventListener('storage', handleStorageChange);
    //         window.removeEventListener('clientsUpdated', handleStorageChange);
    //     };
    // }, []);
    
    // REMOVED: Duplicate opportunity loading - now handled by the effect above
    
    // PERFORMANCE FIX: Debounce storage writes to prevent expensive operations on every state change
    // Storage writes are expensive with large datasets, so we debounce them
    useEffect(() => {
        // Only save if clients array has meaningful data (not empty on initial load)
        if (!clients || clients.length === 0) {
            return;
        }
        
        // Debounce storage write to avoid blocking UI on rapid state changes
        const timeoutId = setTimeout(() => {
            try {
                safeStorage.setClients(clients);
            } catch (error) {
                console.warn('⚠️ Failed to save clients to storage:', error);
            }
        }, 300); // 300ms debounce - saves after user stops making changes
        
        return () => clearTimeout(timeoutId);
    }, [clients]);

    useEffect(() => {
        if (!Array.isArray(clients) || clients.length === 0) {
            pipelineOpportunitiesLoadedRef.current.clear();
        }
    }, [clients]);
    
    // CRITICAL: Load restored groups from localStorage on mount to survive navigation
    useEffect(() => {
        try {
            const storedGroups = localStorage.getItem('restoredGroupMemberships');
            if (storedGroups) {
                const groupsMap = JSON.parse(storedGroups);
                Object.entries(groupsMap).forEach(([clientId, groups]) => {
                    if (groups && Array.isArray(groups) && groups.length > 0) {
                        // Store as string (client IDs are strings, not numbers)
                        restoredGroupMembershipsRef.current.set(String(clientId), groups);
                    }
                });
                // Loaded restored groups from localStorage on mount
            }
        } catch (error) {
            console.warn('⚠️ Failed to load restored groups from localStorage:', error);
        }
    }, []); // Run only on mount
    
    // CRITICAL FIX: If any clients are missing groupMemberships, fetch them directly from API
    // This ensures ALL clients with groups show their groups, not just those that were cached correctly
    useEffect(() => {
        if (!clients || clients.length === 0) return;
        
        // First, check localStorage for restored groups and apply them immediately
        try {
            const storedGroups = localStorage.getItem('restoredGroupMemberships');
            if (storedGroups) {
                const groupsMap = JSON.parse(storedGroups);
                let restoredCount = 0;
                setClients(prevClients => {
                    const updated = prevClients.map(client => {
                        // Ensure we check with string ID to match localStorage keys
                        const clientIdKey = String(client.id);
                        if (client && client.id && groupsMap[clientIdKey]) {
                            const storedGroups = groupsMap[clientIdKey];
                            if (Array.isArray(storedGroups) && storedGroups.length > 0) {
                                // Check if client already has these groups (avoid unnecessary update)
                                const currentGroups = client.groupMemberships || [];
                                const groupsMatch = currentGroups.length === storedGroups.length &&
                                    currentGroups.every((g, i) => {
                                        const stored = storedGroups[i];
                                        return g?.group?.id === stored?.group?.id || g?.group?.name === stored?.group?.name;
                                    });
                                
                                if (!groupsMatch) {
                                    restoredCount++;
                                    // Populate ref (ensure ID is string for consistency)
                                    restoredGroupMembershipsRef.current.set(String(client.id), [...storedGroups]);
                                    return {
                                        ...client,
                                        groupMemberships: [...storedGroups]
                                    };
                                }
                            }
                        }
                        return client;
                    });
                    if (restoredCount > 0) {
                        // Restored clients' groups from localStorage
                    }
                    return updated;
                });
            }
        } catch (error) {
            console.warn('⚠️ Failed to restore groups from localStorage:', error);
        }
        
        // Check if any clients are missing groupMemberships
        const clientsMissingGroups = clients.filter(c => 
            c && c.id && 
            (!c.groupMemberships || 
            !Array.isArray(c.groupMemberships) || 
            c.groupMemberships.length === 0) &&
            !processedClientIdsRef.current.has(c.id) // Only process if not already processed
        );
        
        if (clientsMissingGroups.length === 0) return;
        
        // Prevent multiple simultaneous fetches
        if (groupMembershipsFetchRef.current) {
            return;
        }
        
        // Only fetch if we have clients that haven't been processed yet
        const unprocessedClients = clientsMissingGroups.filter(c => !processedClientIdsRef.current.has(c.id));
        if (unprocessedClients.length === 0) return;
        
        // Fetching group data for clients missing groupMemberships
        
        // Mark these clients as being processed
        unprocessedClients.forEach(c => processedClientIdsRef.current.add(c.id));
        
        // Fetch fresh data from API for ALL clients missing groups
        const fetchGroupData = async () => {
            try {
                groupMembershipsFetchRef.current = true;
                
                // Ensure DatabaseAPI is available and properly initialized
                if (!window.DatabaseAPI) {
                    console.warn('⚠️ DatabaseAPI not available yet');
                    groupMembershipsFetchRef.current = false;
                    // Remove from processed set so we can retry
                    unprocessedClients.forEach(c => processedClientIdsRef.current.delete(c.id));
                    return;
                }
                
                // Verify makeRequest exists (it should be a method on DatabaseAPI)
                if (typeof window.DatabaseAPI.makeRequest !== 'function') {
                    console.warn('⚠️ DatabaseAPI.makeRequest is not a function');
                    groupMembershipsFetchRef.current = false;
                    unprocessedClients.forEach(c => processedClientIdsRef.current.delete(c.id));
                    return;
                }
                
                let res;
                // Call with proper context - always use window.DatabaseAPI explicitly
                if (typeof window.DatabaseAPI.getClients === 'function') {
                    res = await window.DatabaseAPI.getClients();
                } else if (window.api && typeof window.api.listClients === 'function') {
                    res = await window.api.listClients();
                } else {
                    console.warn('⚠️ No API method available');
                    groupMembershipsFetchRef.current = false;
                    unprocessedClients.forEach(c => processedClientIdsRef.current.delete(c.id));
                    return;
                }
                
                const apiClients = res?.data?.clients || res?.clients || [];
                // Fetched clients from API for groupMemberships restoration
                
                // CRITICAL: Use latestApiClientsRef as PRIMARY source - it has groups from main API call
                // Only fall back to separate API call if latestApiClientsRef doesn't have the client
                const apiClientsMap = new Map();
                
                // First, populate from latestApiClientsRef (highest priority - has groups from main API)
                if (latestApiClientsRef.current && Array.isArray(latestApiClientsRef.current)) {
                    latestApiClientsRef.current.forEach(client => {
                        if (client && client.id) {
                            apiClientsMap.set(client.id, client);
                        }
                    });
                    // Loaded clients from latestApiClientsRef (primary source)
                }
                
                // Then, merge in clients from separate API call (for clients not in latestApiClientsRef)
                apiClients.forEach(client => {
                    if (client && client.id) {
                        const existing = apiClientsMap.get(client.id);
                        if (!existing) {
                            // Client not in latestApiClientsRef - add from API call
                        apiClientsMap.set(client.id, client);
                        } else if (existing.groupMemberships && Array.isArray(existing.groupMemberships) && existing.groupMemberships.length > 0) {
                            // Keep existing groups from latestApiClientsRef (don't overwrite)
                            // Just update other properties if needed
                            apiClientsMap.set(client.id, { ...client, groupMemberships: [...existing.groupMemberships] });
                        }
                    }
                });
                
                // Debug logging removed for performance
                
                // Find all clients that need groupMemberships updated
                const clientsToUpdate = unprocessedClients.filter(client => {
                    const apiClient = apiClientsMap.get(client.id);
                    return apiClient && 
                           apiClient.groupMemberships && 
                           Array.isArray(apiClient.groupMemberships) && 
                           apiClient.groupMemberships.length > 0;
                });
                
                if (clientsToUpdate.length > 0) {
                    // Found groupMemberships for clients, updating state
                    
                    // Store restored groups in ref AND localStorage BEFORE state update to prevent API handler from overwriting
                    const groupsToPersist = new Map();
                    clientsToUpdate.forEach(client => {
                        const apiClient = apiClientsMap.get(client.id);
                        if (apiClient && 
                            apiClient.groupMemberships && 
                            Array.isArray(apiClient.groupMemberships) && 
                            apiClient.groupMemberships.length > 0) {
                            // Store in ref so API handler can preserve them even if prevClient is stale (ensure ID is string)
                            restoredGroupMembershipsRef.current.set(String(client.id), [...apiClient.groupMemberships]);
                            // Also store in Map for localStorage persistence
                            groupsToPersist.set(String(client.id), [...apiClient.groupMemberships]);
                            if (client.name && client.name.toLowerCase().includes('exxaro')) {
                                // Stored group data in ref
                            }
                        }
                    });
                    
                    // CRITICAL: Persist restored groups to localStorage so they survive navigation
                    if (groupsToPersist.size > 0) {
                        try {
                            const existingGroups = JSON.parse(localStorage.getItem('restoredGroupMemberships') || '{}');
                            groupsToPersist.forEach((groups, clientId) => {
                                existingGroups[clientId] = groups;
                            });
                            localStorage.setItem('restoredGroupMemberships', JSON.stringify(existingGroups));
                            console.log(`💾 Persisted ${groupsToPersist.size} restored groups to localStorage`);
                        } catch (error) {
                            console.warn('⚠️ Failed to persist restored groups to localStorage:', error);
                        }
                    }
                    
                    // Update all clients with their groupMemberships in a single state update
                    setClients(prevClients => {
                        // Always create a new array to ensure React detects the change
                        const updated = prevClients.map(client => {
                            const apiClient = apiClientsMap.get(client.id);
                            if (apiClient && 
                                apiClient.groupMemberships && 
                                Array.isArray(apiClient.groupMemberships) && 
                                apiClient.groupMemberships.length > 0) {
                                // Always update with API data if available (don't check if client already has it)
                                    // Restoring groupMemberships for client
                                // Create new client object with groupMemberships
                                    return {
                                        ...client,
                                    groupMemberships: [...apiClient.groupMemberships] // Create new array reference
                                };
                            }
                            // Always return a new object reference to ensure React detects changes
                            // Preserve existing groupMemberships if API doesn't have them
                            return { 
                                ...client,
                                groupMemberships: client.groupMemberships ? [...client.groupMemberships] : []
                            };
                        });
                        
                        // Debug: Verify Exxaro clients have groupMemberships after update
                        const exxaroAfterUpdate = updated.filter(c => c.name && c.name.toLowerCase().includes('exxaro'));
                        exxaroAfterUpdate.forEach(c => {
                            console.log(`🔍 After state update - ${c.name}:`, {
                                hasGroupMemberships: !!c.groupMemberships,
                                isArray: Array.isArray(c.groupMemberships),
                                length: c.groupMemberships?.length || 0
                            });
                        });
                        
                        // Always return new array reference
                        return updated;
                    });
                } else {
                    // No clients found with groupMemberships in API response
                }
            } catch (error) {
                console.error('❌ Error fetching groupMemberships:', error);
                // Remove from processed set on error so we can retry
                unprocessedClients.forEach(c => processedClientIdsRef.current.delete(c.id));
            } finally {
                groupMembershipsFetchRef.current = false;
            }
        };
        
        // Debounce to avoid multiple calls (wait 2 seconds after clients change to allow main API call to complete)
        const timeoutId = setTimeout(fetchGroupData, 2000);
        return () => {
            clearTimeout(timeoutId);
            groupMembershipsFetchRef.current = false;
        };
    }, [clients.length]); // Only depend on clients.length to prevent infinite loops
    
    // Leads are now database-only, no localStorage sync needed

    const handleClientModalClose = async (skipReload = false) => {
        try {
            setViewMode('clients');
            setEditingClientId(null);
            setFullClientForDetail(null);
            selectedClientRef.current = null;
            isFormOpenRef.current = false;
            setCurrentTab('overview');
            
            // Clear the URL path to go back to clients list
            if (window.RouteState && window.RouteState.navigate) {
                try {
                    window.RouteState.navigate({
                        page: 'clients',
                        segments: [],
                        search: '',
                        hash: '',
                        replace: false,
                        preserveSearch: false,
                        preserveHash: false
                    });
                } catch (routeError) {
                    // Silently fail - URL update is non-critical
                }
            }
            
            // CRITICAL: Don't reload immediately after deletion - it overwrites the optimistic update
            // Only reload if skipReload is false (normal close, not after deletion)
            if (!skipReload) {
                // Refresh data from server in background (non-blocking)
                loadClients(true).catch(() => {
                    // Silently fail - refresh is non-critical for modal close
                });
            }
            
            // Start sync in background (non-blocking)
            try {
                startSync();
            } catch (syncError) {
                // Silently fail - sync restart is non-critical
            }
        } catch (error) {
            // Still try to close the modal even if there's an error
            setViewMode('clients');
            setEditingClientId(null);
            selectedClientRef.current = null;
            isFormOpenRef.current = false;
        }
    };

    const handleLeadModalClose = async (skipReload = false) => {
        let returnToPipeline = false;
        try {
            returnToPipeline = sessionStorage.getItem('returnToPipeline') === 'true';
        } catch (error) {
            // Silently fail - sessionStorage access is non-critical
        }
        
        // Clear URL segments to prevent route handler from reopening the detail view
        if (window.RouteState && window.RouteState.navigate) {
            try {
                const targetView = returnToPipeline ? 'pipeline' : 'leads';
                window.RouteState.navigate({
                    page: 'clients',
                    segments: [],
                    search: '',
                    hash: '',
                    replace: false,
                    preserveSearch: false,
                    preserveHash: false
                });
            } catch (error) {
                // Silently fail - URL update is non-critical
            }
        }
        
        if (returnToPipeline) {
            try {
                sessionStorage.removeItem('returnToPipeline');
            } catch (error) {
                // Silently fail - sessionStorage clear is non-critical
            }
            setViewMode('pipeline');
        } else {
            setViewMode('leads');
        }
        setEditingLeadId(null);
        selectedLeadRef.current = null;
        isFormOpenRef.current = false;
        setCurrentLeadTab('overview');
        
        // Only refresh data if skipReload is false (to prevent overwriting optimistic updates)
        if (!skipReload) {
            // Wait a moment for any pending database transactions to commit
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Refresh data from server in background (non-blocking)
            // Force refresh to get updated groupMemberships
            console.log('🔄 Refreshing leads after modal close to get updated groups...');
            loadLeads(true).catch((err) => {
                console.warn('⚠️ Failed to refresh leads after modal close:', err);
            });
        }
        startSync();
    };
    
    const handlePauseSync = (pause) => {
        isFormOpenRef.current = pause;
    };
    
    const handleSaveClient = async (clientFormData, stayInEditMode = false) => {
        
        // Validate required fields - handle undefined/null safely
        if (!clientFormData) {
            alert('Error: Form data is missing. Please try again.');
            return;
        }
        
        const clientName = clientFormData.name;
        if (!clientName || (typeof clientName === 'string' && clientName.trim() === '')) {
            alert('Please enter a Client Name to save the client.');
            return;
        }
        
        // Get selectedClient from editingClientId
        const selectedClient = editingClientId ? clients.find(c => c.id === editingClientId) : null;
        
        // Declare comprehensiveClient outside try block so it's available in catch
        let comprehensiveClient = null;
        
        try {
            // Check if user is logged in
            const token = window.storage?.getToken?.() || null;
            
            // Create comprehensive client object with ALL fields
            // Ensure name is trimmed and non-empty (validation should have caught empty names, but double-check here)
            const clientName = (typeof clientFormData.name === 'string' ? clientFormData.name.trim() : (clientFormData.name || ''));
            if (!clientName) {
                alert('Please enter a Client Name to save the client.');
                return null;
            }
            
            comprehensiveClient = {
                id: selectedClient ? selectedClient.id : Date.now().toString(),
                name: clientName,
                status: clientFormData.status || 'Active',
                industry: clientFormData.industry || 'Other',
                type: 'client',
                revenue: clientFormData.revenue || 0,
                lastContact: clientFormData.lastContact || new Date().toISOString().split('T')[0],
                address: clientFormData.address || '',
                website: clientFormData.website || '',
                notes: clientFormData.notes || '',
                contacts: clientFormData.contacts || [],
                followUps: clientFormData.followUps || [],
                projectIds: clientFormData.projectIds || [],
                comments: clientFormData.comments || [],
                sites: Array.isArray(clientFormData.sites) ? clientFormData.sites : [],
                opportunities: clientFormData.opportunities || [],
                contracts: clientFormData.contracts || [],
                activityLog: clientFormData.activityLog || [],
                    services: Array.isArray(clientFormData.services) ? clientFormData.services : [],
                billingTerms: clientFormData.billingTerms || {
                    paymentTerms: 'Net 30',
                    billingFrequency: 'Monthly',
                    currency: 'ZAR',
                    retainerAmount: 0,
                    taxExempt: false,
                    notes: ''
                },
                kyc: clientFormData.kyc != null && typeof clientFormData.kyc === 'object' ? clientFormData.kyc : (typeof clientFormData.kyc === 'string' && clientFormData.kyc ? (() => { try { return JSON.parse(clientFormData.kyc); } catch (_) { return {}; } })() : {})
            };
            
            
            // Don't save to localStorage YET - wait for API to succeed
            // This ensures database is the source of truth
            
            let apiResponse = null; // Declare outside if/else so we can use it for return value
            
            if (!token) {
                // No token, save to localStorage only
                    if (selectedClient) {
                        const updated = clients.map(c => c.id === selectedClient.id ? comprehensiveClient : c);
                        setClients(updated);
                        safeStorage.setClients(updated);
                        // CRITICAL: Always use comprehensiveClient (which has latest notes) instead of API response
                        // This ensures notes typed by user are never lost
                        selectedClientRef.current = comprehensiveClient; // Update ref with comprehensiveClient (has latest notes)
                    } else {
                        const newClients = [...clients, comprehensiveClient];
                        setClients(newClients);
                        safeStorage.setClients(newClients);
                        selectedClientRef.current = comprehensiveClient; // Update ref to show new data
                    }
                    // Return comprehensiveClient (has latest notes) for localStorage-only saves
                    return comprehensiveClient;
            } else {
                // Use API - database is source of truth
                try {
                    
                    if (selectedClient) {
                        // For updates, send ALL comprehensive data to API
                        const apiUpdateData = {
                            name: comprehensiveClient.name,
                            type: comprehensiveClient.type || 'client',
                            industry: comprehensiveClient.industry,
                            // Preserve status as-is - don't force conversion to lowercase
                            status: comprehensiveClient.status || 'Active',
                            revenue: comprehensiveClient.revenue,
                            lastContact: comprehensiveClient.lastContact,
                            address: comprehensiveClient.address,
                            website: comprehensiveClient.website,
                            notes: comprehensiveClient.notes || '', // Ensure notes is always sent (even if empty string)
                            contacts: comprehensiveClient.contacts,
                            followUps: comprehensiveClient.followUps,
                            projectIds: comprehensiveClient.projectIds,
                            comments: comprehensiveClient.comments,
                            sites: comprehensiveClient.sites,
                            // opportunities field removed - conflicts with Prisma relation
                            contracts: comprehensiveClient.contracts,
                            activityLog: comprehensiveClient.activityLog,
                            services: comprehensiveClient.services,
                            billingTerms: comprehensiveClient.billingTerms,
                            kyc: comprehensiveClient.kyc ?? {} // always send kyc so it persists on reload
                        };
                        
                        try {
                            // Persist KYC via dedicated endpoint first so it survives refresh even if full PATCH is large/slow
                            const kycToPersist = comprehensiveClient.kyc != null && typeof comprehensiveClient.kyc === 'object' ? comprehensiveClient.kyc : {};
                            const hasMeaningfulKyc = (k) => (k && (typeof k.clientType === 'string' && k.clientType.trim()) || (k.legalEntity && typeof k.legalEntity.registeredLegalName === 'string' && k.legalEntity.registeredLegalName.trim()));
                            const saveKyc = (window.api?.saveClientKyc || window.DatabaseAPI?.saveClientKyc);
                            if (saveKyc && typeof saveKyc === 'function' && hasMeaningfulKyc(kycToPersist)) {
                                await saveKyc(selectedClient.id, kycToPersist).catch(() => {});
                            }
                            apiResponse = await window.api.updateClient(selectedClient.id, apiUpdateData);
                            
                            // Clear caches in background (non-blocking)
                            Promise.all([
                                window.ClientCache?.clearCache?.(),
                                window.DatabaseAPI?.clearCache?.('/clients')
                            ]).catch(() => {});
                            
                            // Trigger background sync (non-blocking)
                            window.LiveDataSync?.forceSync?.().catch(() => {});
                        } catch (apiCallError) {
                            throw apiCallError; // Re-throw to be caught by outer catch
                        }
                    } else {
                        // NEW CLIENT: optimistic update – add to list and close modal immediately, then persist in background
                        const tempId = 'new-' + Date.now();
                        const optimisticClient = { ...comprehensiveClient, id: tempId };
                        const newClientsOptimistic = [...clients, optimisticClient];
                        setClients(newClientsOptimistic);
                        safeStorage.setClients(newClientsOptimistic);
                        handlePauseSync(false);
                        if (window.LiveDataSync?.start) {
                            window.LiveDataSync.start();
                        }
                        handleClientModalClose(true); // close modal and show new client in list immediately
                        
                        const apiCreateData = {
                            name: comprehensiveClient.name,
                            type: comprehensiveClient.type || 'client',
                            industry: comprehensiveClient.industry,
                            status: comprehensiveClient.status === 'Active' || comprehensiveClient.status === 'active' || !comprehensiveClient.status ? 'active' : 'inactive',
                            revenue: comprehensiveClient.revenue,
                            lastContact: comprehensiveClient.lastContact,
                            address: comprehensiveClient.address,
                            website: comprehensiveClient.website,
                            notes: comprehensiveClient.notes || '', // Ensure notes is always sent
                            contacts: comprehensiveClient.contacts,
                            followUps: comprehensiveClient.followUps,
                            projectIds: comprehensiveClient.projectIds,
                            comments: comprehensiveClient.comments,
                            sites: comprehensiveClient.sites,
                            contracts: comprehensiveClient.contracts,
                            activityLog: comprehensiveClient.activityLog,
                            services: comprehensiveClient.services,
                            billingTerms: comprehensiveClient.billingTerms,
                            kyc: comprehensiveClient.kyc
                        };
                        
                        try {
                            apiResponse = await window.api.createClient(apiCreateData);
                        } catch (createErr) {
                            // Rollback optimistic update on API failure
                            setClients(prev => prev.filter(c => c.id !== tempId));
                            safeStorage.setClients(clients); // restore previous list
                            const msg = createErr?.message || 'Unknown error';
                            if (msg.includes('name required') || msg.includes('name is required')) {
                                alert('Error: Client name is required.');
                            } else if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('already exists')) {
                                alert(`Error: ${msg}\n\nA client with this name may already exist.`);
                            } else {
                                alert('Failed to add client: ' + msg);
                            }
                            return null;
                        }
                        
                        const savedClient = apiResponse?.data?.client || apiResponse?.client || comprehensiveClient;
                        if (savedClient && comprehensiveClient.notes !== undefined && comprehensiveClient.notes !== null) {
                            savedClient.notes = comprehensiveClient.notes;
                        }
                        const finalClient = { ...savedClient, ...comprehensiveClient };
                        if (apiResponse?.data?.client?.id) {
                            finalClient.id = apiResponse.data.client.id;
                        }
                        
                        // Replace optimistic row with real client from API
                        setClients(prev => {
                            const next = prev.map(c => c.id === tempId ? finalClient : c);
                            safeStorage.setClients(next);
                            return next;
                        });
                        
                        Promise.all([
                            window.ClientCache?.clearCache?.(),
                            window.DatabaseAPI?.clearCache?.('/clients'),
                            window.DatabaseAPI?.clearCache?.('/leads'),
                            window.dataManager?.invalidate?.('clients')
                        ]).catch(() => {});
                        const scheduleRefresh = (cb) => {
                            if (typeof window.requestIdleCallback === 'function') {
                                try { window.requestIdleCallback(cb); return; } catch (_) {}
                            }
                            setTimeout(cb, 0);
                        };
                        scheduleRefresh(() => window.LiveDataSync?.forceSync?.().catch(() => {}));
                        return finalClient;
                    }
                    
                    // Prepare saved client with merged data from API response and comprehensiveClient (update path only)
                    const savedClient = apiResponse?.data?.client || apiResponse?.client || comprehensiveClient;
                    if (savedClient && comprehensiveClient.notes !== undefined && comprehensiveClient.notes !== null) {
                        savedClient.notes = comprehensiveClient.notes;
                    }
                    const finalClient = { ...savedClient, ...comprehensiveClient };
                    
                    if (selectedClient) {
                        const updated = clients.map(c => c.id === selectedClient.id ? finalClient : c);
                        if (updated.length !== clients.length) {
                            return;
                        }
                        setClients(updated);
                        safeStorage.setClients(updated);
                        selectedClientRef.current = finalClient;
                    }
                    
                } catch (apiError) {
                    const errorMessage = apiError.message || 'Unknown error';
                    
                    // Check for specific error messages and show user-friendly alerts
                    if (errorMessage.includes('name required') || errorMessage.includes('name is required')) {
                        alert('Error: Client name is required. Please make sure the Client Name field is filled in.');
                        return; // Don't fall back to localStorage if validation fails
                    }
                    
                    // Check for duplicate client errors
                    if (errorMessage.toLowerCase().includes('duplicate') || errorMessage.toLowerCase().includes('already exists')) {
                        alert(`Error: ${errorMessage}\n\nPlease check if a client with this name already exists.`);
                        return; // Don't fall back to localStorage for duplicates
                    }
                    
                    if (errorMessage.includes('Unauthorized') || errorMessage.includes('401')) {
                        window.storage?.removeToken?.();
                        window.storage?.removeUser?.();
                    }
                    
                    // For other errors, show the error message but still allow fallback
                    if (!errorMessage.includes('name required') && !errorMessage.includes('duplicate')) {
                        alert(`Error saving client: ${errorMessage}\n\nAttempting to save locally...`);
                    }
                    
                    // Always fall back to localStorage on any API error (except validation errors)
                    
                    if (selectedClient) {
                        const updated = clients.map(c => c.id === selectedClient.id ? comprehensiveClient : c);
                        setClients(updated);
                        safeStorage.setClients(updated);
                        selectedClientRef.current = comprehensiveClient; // Update ref to show new data
                    } else {
                        const newClients = [...clients, comprehensiveClient];
                        setClients(newClients);
                        safeStorage.setClients(newClients);
                        selectedClientRef.current = comprehensiveClient; // Update ref to show new data
                    }
                }
            }
            
            // Return the saved client (merge API response with comprehensiveClient to ensure all data is present)
            const savedClient = apiResponse?.data?.client || apiResponse?.client || comprehensiveClient;
            // Ensure comprehensiveClient data is preserved (especially notes)
            const finalSavedClient = { ...savedClient, ...comprehensiveClient };
            
            // Handle post-save actions (only if not staying in edit mode)
            if (!stayInEditMode) {
                handlePauseSync(false);
                if (window.LiveDataSync && window.LiveDataSync.start) {
                    window.LiveDataSync.start();
                }
                
                // CRITICAL: If this is a NEW client (not an update), close the modal and return to clients list
                if (!selectedClient) {
                    // Close the modal and return to clients list
                    handleClientModalClose(true); // skipReload=true to prevent overwriting optimistic update
                }
            }
            
            return finalSavedClient;
            
        } catch (error) {
            console.error('Failed to save client:', error);
            const errorMessage = error.message || 'Unknown error';
            
            // Show user-friendly error messages
            if (errorMessage.includes('name required') || errorMessage.includes('name is required')) {
                alert('Error: Client name is required. Please make sure the Client Name field is filled in.');
            } else if (errorMessage.toLowerCase().includes('duplicate') || errorMessage.toLowerCase().includes('already exists')) {
                alert(`Error: ${errorMessage}\n\nPlease check if a client with this name already exists.`);
            } else {
                alert('Failed to save client: ' + errorMessage);
            }
            
            // Return comprehensiveClient even on error so modal can preserve local state
            // If comprehensiveClient wasn't created, create a minimal one from formData
            if (!comprehensiveClient) {
                comprehensiveClient = {
                    id: Date.now().toString(),
                    name: clientFormData.name || '',
                    status: clientFormData.status || 'Active',
                    industry: clientFormData.industry || 'Other',
                    type: 'client',
                    ...clientFormData
                };
            }
            return comprehensiveClient;
        }
    };
    
    const handleSaveLead = async (leadFormData, stayInEditMode = false) => {
        
        // Validate required fields - handle undefined/null safely
        if (!leadFormData) {
            alert('Error: Form data is missing. Please try again.');
            return;
        }
        
        const leadName = leadFormData.name;
        if (!leadName || (typeof leadName === 'string' && leadName.trim() === '')) {
            alert('Please enter an Entity Name to save the lead.');
            return;
        }
        
        // Get selectedLead: prefer list, fallback to ref (full-page lead view may use ref)
        const selectedLead = (editingLeadId && Array.isArray(leads) ? leads.find(l => l.id === editingLeadId) : null)
            || (editingLeadId && selectedLeadRef.current?.id === editingLeadId ? selectedLeadRef.current : null);
        
        try {
            const token = window.storage?.getToken?.();
            
            if (selectedLead) {
                // Update existing lead with ALL fields from form data
                // Explicitly ensure contacts, followUps, comments, and notes are included
                const updatedLead = { 
                    ...selectedLead, 
                    ...leadFormData,
                    // Ensure critical fields are preserved
                    status: leadFormData.status,
                    // CRITICAL: Map aidaStatus to stage if present (ClientDetailModal uses aidaStatus, database uses stage)
                    stage: leadFormData.stage || leadFormData.aidaStatus || selectedLead.stage,
                    // Explicitly include these fields to ensure they're saved
                    contacts: Array.isArray(leadFormData.contacts) ? leadFormData.contacts : (selectedLead.contacts || []),
                    followUps: Array.isArray(leadFormData.followUps) ? leadFormData.followUps : (selectedLead.followUps || []),
                    comments: Array.isArray(leadFormData.comments) ? leadFormData.comments : (selectedLead.comments || []),
                    notes: leadFormData.notes !== undefined ? leadFormData.notes : (selectedLead.notes || ''),
                    // Preserve other fields
                    sites: Array.isArray(leadFormData.sites) ? leadFormData.sites : (selectedLead.sites || []),
                    contracts: Array.isArray(leadFormData.contracts) ? leadFormData.contracts : (selectedLead.contracts || []),
                    activityLog: Array.isArray(leadFormData.activityLog) ? leadFormData.activityLog : (selectedLead.activityLog || []),
                    projectIds: Array.isArray(leadFormData.projectIds) ? leadFormData.projectIds : (selectedLead.projectIds || []),
                    proposals: Array.isArray(leadFormData.proposals) ? leadFormData.proposals : (selectedLead.proposals || []),
                    services: Array.isArray(leadFormData.services) ? leadFormData.services : (selectedLead.services || []),
                    // Explicitly include externalAgentId to ensure it's saved (even if null)
                    externalAgentId: leadFormData.externalAgentId !== undefined ? (leadFormData.externalAgentId || null) : (selectedLead.externalAgentId || null),
                    // Explicitly include KYC so it always persists when editing leads
                    kyc: (leadFormData.kyc != null && typeof leadFormData.kyc === 'object') ? leadFormData.kyc : (selectedLead.kyc && typeof selectedLead.kyc === 'object' ? selectedLead.kyc : {})
                };
                
                
                if (token && window.api?.updateLead) {
                    try {
                        // CRITICAL: Ensure notes are explicitly included and not undefined
                        // Read from formDataRef if available (from ClientDetailModal's onBlur)
                        const notesToSave = updatedLead.notes !== undefined && updatedLead.notes !== null 
                            ? String(updatedLead.notes) 
                            : (leadFormData.notes !== undefined && leadFormData.notes !== null 
                                ? String(leadFormData.notes) 
                                : (selectedLead.notes || ''));
                        
                        const leadDataToSend = {
                            ...updatedLead,
                            notes: notesToSave, // Ensure notes is always a string, never undefined
                            kyc: updatedLead.kyc, // Ensure KYC is explicitly sent so it persists locally and in API
                            // Ensure sites are always sent when present (critical for lead site form persistence)
                            sites: Array.isArray(leadFormData.sites) ? leadFormData.sites : (updatedLead.sites || [])
                        };
                        
                        // CRITICAL: Log what we're sending (including sites for persistence debugging)
                        const sites = Array.isArray(leadDataToSend.sites) ? leadDataToSend.sites : [];
                        console.log('💾 [handleSaveLead] Sending lead data:', {
                            leadId: leadDataToSend.id,
                            commentsCount: Array.isArray(leadDataToSend.comments) ? leadDataToSend.comments.length : 0,
                            followUpsCount: Array.isArray(leadDataToSend.followUps) ? leadDataToSend.followUps.length : 0,
                            sitesCount: sites.length,
                            sitesSample: sites.slice(0, 3).map(s => ({ id: s.id, name: s.name, stage: s.stage, aidaStatus: s.aidaStatus })),
                            hasComments: leadDataToSend.comments !== undefined,
                            hasFollowUps: leadDataToSend.followUps !== undefined,
                            hasSites: leadDataToSend.sites !== undefined
                        });
                        
                        const apiResponse = await window.api.updateLead(leadDataToSend.id, leadDataToSend);
                        
                        // Clear all caches to ensure updates appear immediately
                        if (window.ClientCache?.clearCache) {
                            window.ClientCache.clearCache();
                        }
                        if (window.DatabaseAPI?.clearCache) {
                            window.DatabaseAPI.clearCache('/leads');
                        }
                        
                        // Trigger immediate LiveDataSync to ensure all users see the change
                        if (window.LiveDataSync?.forceSync) {
                            window.LiveDataSync.forceSync().catch(() => {
                                // Sync will happen automatically, ignore errors
                            });
                        }
                        
                        // Extract the saved lead from API response - try multiple possible locations
                        let savedLead = apiResponse?.data?.lead || apiResponse?.lead || apiResponse?.data || updatedLead;
                        
                        // API response processed
                        
                        // Safe JSON parser helper
                        const safeParseJSON = (value, defaultValue) => {
                            if (typeof value !== 'string') return value || defaultValue;
                            try {
                                return JSON.parse(value || JSON.stringify(defaultValue));
                            } catch (e) {
                                return defaultValue;
                            }
                        };
                        
                        // Parse JSON fields from database (they come as strings)
                        const parsedApiLead = {
                            ...savedLead,
                            stage: savedLead.stage || updatedLead.stage || 'Awareness', // Ensure stage is preserved
                            status: savedLead.status || updatedLead.status || 'active', // Ensure status is preserved
                            // CRITICAL: Preserve notes from what we just sent (leadDataToSend) or API response
                            // Always ensure notes is a string, never undefined
                            notes: (leadDataToSend.notes !== undefined && leadDataToSend.notes !== null) 
                                ? String(leadDataToSend.notes) 
                                : (savedLead.notes !== undefined && savedLead.notes !== null 
                                    ? String(savedLead.notes) 
                                    : ''),
                            contacts: safeParseJSON(savedLead.contacts, []),
                            followUps: safeParseJSON(savedLead.followUps, []),
                            projectIds: safeParseJSON(savedLead.projectIds, []),
                            comments: safeParseJSON(savedLead.comments, []),
                            activityLog: safeParseJSON(savedLead.activityLog, []),
                            sites: safeParseJSON(savedLead.sites, []),
                            contracts: safeParseJSON(savedLead.contracts, []),
                            billingTerms: safeParseJSON(savedLead.billingTerms, {}),
                            // CRITICAL: Preserve proposals from leadFormData (what we just sent) instead of API response
                            // API response might have stale or missing proposals
                            proposals: safeParseJSON(leadFormData.proposals || savedLead.proposals, []),
                            // CRITICAL: Preserve services from leadFormData (what we just sent) instead of API response
                            services: safeParseJSON(leadFormData.services || savedLead.services, [])
                        };
                        
                        // FINAL MERGE (mirror client behaviour):
                        // Always prefer the latest form data for fields the user just edited,
                        // especially comments, notes, and sites (Stage/AIDA per site). This makes
                        // leads behave like clients: the UI is the source of truth immediately after a save.
                        const finalSavedLead = {
                            ...parsedApiLead,
                            // Prefer comments from the form data if present; fall back to parsed API comments.
                            comments: Array.isArray(leadFormData.comments)
                                ? leadFormData.comments
                                : (parsedApiLead.comments || []),
                            // Prefer notes from the form data if present (already normalised above)
                            notes: parsedApiLead.notes,
                            // Prefer sites from form data so per-site Stage/AIDA persist in UI after save
                            sites: Array.isArray(leadFormData.sites)
                                ? leadFormData.sites
                                : (parsedApiLead.sites || [])
                        };
                        
                        // CRITICAL: Use the merged lead (API + form data) to update state.
                        // This ensures comments/notes never disappear after a save.
                        const savedLeads = leads.map(l => l.id === finalSavedLead.id ? finalSavedLead : l);
                        setLeads(savedLeads);
                        selectedLeadRef.current = finalSavedLead; // Update selected lead ref with persisted data
                        
                        // Also update localStorage to keep cache in sync
                        if (window.storage?.setLeads) {
                            window.storage.setLeads(savedLeads);
                        }
                        
                        // Invalidate API cache to ensure next load is fresh
                        if (window.DatabaseAPI?.clearCache) {
                            window.DatabaseAPI.clearCache('/leads');
                        }
                        
                        // CRITICAL: Refresh from database after save to ensure persistence
                        // For normal saves we do a delayed refresh. However, when stayInEditMode is true
                        // (e.g. adding comments/notes), this refresh can cause the lead detail view
                        // to re-render and reset the active tab back to Overview.
                        //
                        // To prevent the Notes tab from resetting after adding a comment, we SKIP the
                        // delayed refresh when stayInEditMode is true. The immediate API response
                        // (savedLead / leadDataToSend) already contains the latest comments.
                        if (!stayInEditMode) {
                            // Wait a short moment for database to commit, then fetch fresh data
                            setTimeout(async () => {
                                try {
                                    const token = window.storage?.getToken?.();
                                    if (!token) return;
                                    
                                    const response = await fetch(`/api/leads/${savedLead.id}`, {
                                        method: 'GET',
                                        headers: {
                                            'Authorization': `Bearer ${token}`,
                                            'Content-Type': 'application/json'
                                        },
                                        credentials: 'include'
                                    });
                                    
                                    if (response.ok) {
                                        const refreshedLead = await response.json();
                                        const freshLead = refreshedLead?.data?.lead || refreshedLead?.lead;
                                        if (freshLead) {
                                            // Parse JSON fields
                                            const parseField = (val, defaultVal) => {
                                                if (Array.isArray(val)) return val;
                                                if (typeof val === 'string' && val.trim()) {
                                                    try { return JSON.parse(val); } catch { return defaultVal; }
                                                }
                                                return val || defaultVal;
                                            };
                                            const parsedLead = {
                                                ...freshLead,
                                                // CRITICAL: Explicitly preserve status and stage from database
                                                status: freshLead.status || updatedLead.status || 'Potential',
                                                stage: freshLead.stage || updatedLead.stage || 'Awareness',
                                                // CRITICAL: Map stage to aidaStatus for ClientDetailModal (uses aidaStatus in formData)
                                                aidaStatus: freshLead.aidaStatus || freshLead.stage || updatedLead.aidaStatus || updatedLead.stage || 'Awareness',
                                                // CRITICAL: Preserve notes from database - always ensure it's a string
                                                notes: freshLead.notes !== undefined && freshLead.notes !== null 
                                                    ? String(freshLead.notes) 
                                                    : (leadDataToSend?.notes !== undefined && leadDataToSend.notes !== null 
                                                        ? String(leadDataToSend.notes) 
                                                        : (updatedLead.notes || '')),
                                                // CRITICAL: Preserve followUps from database - use parseField to handle normalized table data
                                                followUps: parseField(freshLead.followUps, []),
                                                contacts: parseField(freshLead.contacts, []),
                                                comments: parseField(freshLead.comments, []),
                                                proposals: parseField(freshLead.proposals, []),
                                                services: parseField(freshLead.services, []),
                                                // Preserve sites (including per-site stage/aidaStatus) from refreshed lead
                                                sites: parseField(freshLead.sites, [])
                                            };
                                            
                                            console.log('🔄 Refreshed lead after save:', {
                                                id: parsedLead.id,
                                                status: parsedLead.status,
                                                stage: parsedLead.stage,
                                                freshStatus: freshLead.status,
                                                freshStage: freshLead.stage,
                                                notesLength: parsedLead.notes?.length || 0,
                                                followUpsCount: parsedLead.followUps?.length || 0,
                                                commentsCount: parsedLead.comments?.length || 0
                                            });
                                            
                                            // Update state with fresh data from database
                                            const refreshedLeads = leads.map(l => 
                                                l.id === parsedLead.id ? parsedLead : l
                                            );
                                            setLeads(refreshedLeads);
                                            // CRITICAL: Update ref AFTER setLeads to ensure component uses fresh data
                                            selectedLeadRef.current = parsedLead;
                                            
                                            // Update localStorage with fresh data
                                            if (window.storage?.setLeads) {
                                                window.storage.setLeads(refreshedLeads);
                                            }
                                            
                                            // CRITICAL: Force React to recognize the update by updating the leads array reference
                                            // This ensures the modal receives the updated client prop with fresh comments
                                            // The selectedLead computation will use the refreshed leads array
                                            // (selectedLeadRef.current is updated, but setLeads triggers re-render which recomputes selectedLead)
                                        }
                                    }
                                } catch (refreshError) {
                                    // Not critical - data was already saved
                                }
                            }, 3500); // Wait 3500ms for database commit
                        }
                        
                    } catch (apiError) {
                        // If API fails, still update local state but show warning
                        const updatedLeads = leads.map(l => l.id === selectedLead.id ? updatedLead : l);
                        setLeads(updatedLeads);
                        selectedLeadRef.current = updatedLead; // Update ref with updated lead
                        
                        // Save to localStorage even when API fails
                        if (window.storage?.setLeads) {
                            try {
                                window.storage.setLeads(updatedLeads);
                            } catch (e) {
                                console.warn('⚠️ Failed to save lead to localStorage:', e);
                            }
                        }
                        
                        alert('Lead saved locally but may not have been saved to database. Please check your connection.');
                    }
                } else {
                    // No authentication - just update local state
                    const updatedLeads = leads.map(l => l.id === selectedLead.id ? updatedLead : l);
                    setLeads(updatedLeads);
                    selectedLeadRef.current = updatedLead; // Update ref with updated lead
                    
                    // Save to localStorage even without authentication
                    if (window.storage?.setLeads) {
                        try {
                            window.storage.setLeads(updatedLeads);
                        } catch (e) {
                            console.warn('⚠️ Failed to save lead to localStorage:', e);
                        }
                    }
                    
                }
            } else {
                        // Validate name for new leads - handle undefined/null safely
                        const leadName = leadFormData.name;
                        if (!leadName || (typeof leadName === 'string' && leadName.trim() === '')) {
                            alert('Please enter an Entity Name to create a lead.');
                            return;
                        }
                
                // Create new lead
                // Get current user info
                const user = window.storage?.getUser?.() || {};
                const currentUser = {
                    name: user?.name || 'System',
                    email: user?.email || 'system',
                    id: user?.id || 'system'
                };
                
                // Ensure name is trimmed and valid
                const trimmedName = typeof leadName === 'string' ? leadName.trim() : String(leadName || '');
                if (!trimmedName) {
                    alert('Please enter an Entity Name to create a lead.');
                    return;
                }
                
                const newLead = {
                    ...leadFormData,
                    name: trimmedName, // Ensure name is trimmed
                    id: Date.now().toString(), // Generate local ID
                    type: 'lead', // Ensure it's marked as a lead
                    lastContact: new Date().toISOString().split('T')[0],
                    // CRITICAL: Explicitly include notes to ensure they're saved (like clients do)
                    notes: leadFormData.notes !== undefined && leadFormData.notes !== null ? String(leadFormData.notes) : '',
                    // Explicitly include externalAgentId to ensure it's saved (even if null)
                    externalAgentId: leadFormData.externalAgentId !== undefined ? (leadFormData.externalAgentId || null) : null,
                    // CRITICAL: Explicitly include contacts to ensure they're saved when creating a new lead
                    contacts: Array.isArray(leadFormData.contacts) ? leadFormData.contacts : [],
                    activityLog: [{
                        id: Date.now(),
                        type: 'Lead Created',
                        description: `Lead created: ${leadFormData.name}`,
                        timestamp: new Date().toISOString(),
                        user: currentUser.name,
                        userId: currentUser.id,
                        userEmail: currentUser.email
                    }]
                };
                
                if (token && window.api?.createLead) {
                    try {
                        const apiResponse = await window.api.createLead(newLead);
                        
                        // Extract lead from response - API returns { data: { lead: {...} } }
                        let savedLead = apiResponse?.data?.lead || apiResponse?.lead || apiResponse?.data || null;
                        
                        // If savedLead is still null or doesn't have an id, throw error
                        if (!savedLead || !savedLead.id) {
                            throw new Error('API response missing lead data');
                        }
                        
                        // CRITICAL: Ensure savedLead has all required fields including type
                        // ALWAYS preserve user input from newLead (which contains leadFormData)
                        // This prevents blank values from API from overwriting user's typed input
                        if (savedLead && savedLead.id) {
                            savedLead = {
                                ...savedLead,
                                type: savedLead.type || 'lead', // Ensure type is set
                                // CRITICAL: ALWAYS preserve user input - use savedLead only if it has content, otherwise use newLead
                                name: (savedLead.name && savedLead.name.trim()) ? savedLead.name : (newLead.name || ''),
                                industry: (savedLead.industry && savedLead.industry.trim()) ? savedLead.industry : (newLead.industry || 'Other'),
                                status: savedLead.status || newLead.status || 'Potential',
                                stage: savedLead.stage || newLead.stage || 'Awareness',
                                // CRITICAL: Preserve notes, source, and all other user-entered fields
                                notes: (savedLead.notes && savedLead.notes.trim()) ? savedLead.notes : (newLead.notes || ''),
                                source: (savedLead.source && savedLead.source.trim()) ? savedLead.source : (newLead.source || 'Website'),
                                address: (savedLead.address && savedLead.address.trim()) ? savedLead.address : (newLead.address || ''),
                                website: (savedLead.website && savedLead.website.trim()) ? savedLead.website : (newLead.website || ''),
                                value: savedLead.value !== undefined && savedLead.value !== null ? savedLead.value : (newLead.value || 0),
                                contacts: savedLead.contacts || newLead.contacts || [],
                                services: savedLead.services || newLead.services || [],
                                firstContactDate: savedLead.firstContactDate || savedLead.createdAt ? new Date(savedLead.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                                lastContact: savedLead.lastContact || savedLead.updatedAt ? new Date(savedLead.updatedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
                            };
                        }
                        
                        
                        // CRITICAL: Clear all caches to ensure new lead appears immediately
                        // Clear ClientCache
                        if (window.ClientCache?.clearCache) {
                            window.ClientCache.clearCache();
                        }
                        
                        // Clear DatabaseAPI cache
                        if (window.DatabaseAPI?.clearCache) {
                            window.DatabaseAPI.clearCache('/leads');
                            window.DatabaseAPI.clearCache('/clients'); // Also clear clients since they're related
                        }
                        
                        // Clear localStorage to prevent stale data
                        if (window.storage?.removeLeads) {
                            window.storage.removeLeads();
                        }
                        if (window.storage?.removeClients) {
                            window.storage.removeClients();
                        }
                        
                        // Clear localStorage cache timestamp to force refresh
                        if (window.dataManager?.invalidate) {
                            window.dataManager.invalidate('leads');
                        }
                        
                        // Trigger immediate LiveDataSync to ensure all users see the new lead
                        // Also immediately refresh leads list to show new lead without waiting for sync
                        setTimeout(() => {
                            (async () => {
                                try {
                                    await loadLeads(true); // Force refresh bypasses cache
                                    if (window.LiveDataSync?.forceSync) {
                                        await window.LiveDataSync.forceSync();
                                    }
                                } catch (err) {
                                    if (window.LiveDataSync?.forceSync) {
                                        window.LiveDataSync.forceSync().catch(() => {});
                                    }
                                }
                            })();
                        }, 300); // 300ms delay to ensure DB commit
                        
                        // Use the saved lead from database (with proper ID)
                        if (savedLead && savedLead.id) {
                            // Parse JSON fields if they come as strings from database
                            const safeParseJSON = (value, defaultValue) => {
                                if (typeof value !== 'string') return value || defaultValue;
                                try {
                                    return JSON.parse(value || JSON.stringify(defaultValue));
                                } catch (e) {
                                    return defaultValue;
                                }
                            };
                            
                            // Ensure all JSON fields are properly parsed
                            // CRITICAL: Use savedLead which already has preserved user input from merge above
                            const parsedSavedLead = {
                                ...savedLead, // This already has preserved user input from lines 2185-2203
                                contacts: safeParseJSON(savedLead.contacts, []),
                                followUps: safeParseJSON(savedLead.followUps, []),
                                projectIds: safeParseJSON(savedLead.projectIds, []),
                                comments: safeParseJSON(savedLead.comments, []),
                                activityLog: safeParseJSON(savedLead.activityLog, []),
                                sites: safeParseJSON(savedLead.sites, []),
                                contracts: safeParseJSON(savedLead.contracts, []),
                                proposals: safeParseJSON(savedLead.proposals, []),
                                billingTerms: safeParseJSON(savedLead.billingTerms, {
                                    paymentTerms: 'Net 30',
                                    billingFrequency: 'Monthly',
                                    currency: 'ZAR',
                                    retainerAmount: 0,
                                    taxExempt: false,
                                    notes: ''
                                })
                            };
                            
                            const updatedLeads = [...leads, parsedSavedLead];
                            setLeads(updatedLeads);
                            // leadsCount now calculated from leads.length via useMemo
                            
                            // CRITICAL: If modal is still open (stayInEditMode), update selectedLead with preserved data
                            // This ensures the modal receives the lead with user input preserved, not blank values
                            // For new leads, selectedLead is null initially, but after save we need to update it
                            // if we're staying in edit mode OR if the modal is still open
                            if (viewMode === 'lead-detail') {
                                // Update selectedLead with preserved data so modal can continue showing user's input
                                selectedLeadRef.current = parsedSavedLead; // Update ref with parsed saved lead
                                
                                // CRITICAL: Update editingLeadId when creating a new lead with stayInEditMode=true
                                // This ensures the modal re-renders with the new leadId and can continue working properly
                                if (stayInEditMode && parsedSavedLead.id) {
                                    setEditingLeadId(parsedSavedLead.id);
                                }
                            }
                            
                            // CRITICAL: Save to localStorage immediately to ensure persistence
                            if (window.storage?.setLeads) {
                                try {
                                    window.storage.setLeads(updatedLeads);
                                } catch (e) {
                                    // Silently fail - localStorage persistence is non-critical
                                }
                            }
                            
                        } else {
                            // Fallback to local lead if API doesn't return proper response
                            const updatedLeads = [...leads, newLead];
                            setLeads(updatedLeads);
                            // leadsCount now calculated from leads.length via useMemo
                            
                            // Save to localStorage even in fallback case
                            if (window.storage?.setLeads) {
                                try {
                                    window.storage.setLeads(updatedLeads);
                                } catch (e) {
                                    // Silently fail - localStorage persistence is non-critical
                                }
                            }
                            
                        }
                    } catch (apiError) {
                        const errorMessage = apiError?.message || apiError?.response?.data?.error || 'Unknown error';
                        
                        // Check if it's a validation error
                        if (errorMessage.includes('name required') || errorMessage.includes('name is required')) {
                            alert('Error: Lead name is required. Please make sure the Entity Name field is filled in.');
                            return; // Don't fallback to local creation for validation errors
                        }
                        
                        // For other errors, fallback to local creation
                        alert(`Warning: Could not save lead to server (${errorMessage}). Saved locally only.`);
                        const updatedLeads = [...leads, newLead];
                        setLeads(updatedLeads);
                        // leadsCount now calculated from leads.length via useMemo
                        
                        // Save to localStorage even in error fallback case
                        if (window.storage?.setLeads) {
                            try {
                                window.storage.setLeads(updatedLeads);
                            } catch (e) {
                                // Silently fail - localStorage persistence is non-critical
                            }
                        }
                        
                    }
                } else {
                    // No token or API, create locally only
                    const updatedLeads = [...leads, newLead];
                    setLeads(updatedLeads);
                    // leadsCount now calculated from leads.length via useMemo
                    
                    // Save to localStorage even without authentication
                    if (window.storage?.setLeads) {
                        try {
                            window.storage.setLeads(updatedLeads);
                        } catch (e) {
                            console.warn('⚠️ Failed to save lead to localStorage:', e);
                        }
                    }
                    
                }
                
                // For new leads, close the modal and return to leads list
                // Only if not staying in edit mode
                if (!stayInEditMode) {
                    // Close the modal and return to leads list
                    handleLeadModalClose(true); // skipReload=true to prevent overwriting optimistic update
                }
            }
        } catch (error) {
            const errorMessage = error?.message || 'Unknown error';
            alert(`Failed to save lead: ${errorMessage}`);
        }
    };

    const handleDeleteClient = async (clientId) => {
        try {
            // CRITICAL: Save original clients array BEFORE filtering for error recovery
            const originalClients = [...clients];
            
            // Optimistically update UI first for smooth removal
            const updatedClients = clients.filter(c => c.id !== clientId);
            
            // Temporarily pause LiveDataSync to prevent conflicts
            const wasLiveDataSyncRunning = window.LiveDataSync?.isRunning;
            if (wasLiveDataSyncRunning && window.LiveDataSync?.stop) {
                window.LiveDataSync.stop();
            }
            
            // CRITICAL: Update state immediately (not in startTransition) so UI updates right away
            // startTransition was causing the UI to not update until after the API call completed
            setClients(updatedClients);
            safeStorage.setClients(updatedClients);
            
            // CRITICAL: Close modal immediately after optimistic update, but skip reload
            // This ensures the UI shows the deletion immediately without reload overwriting it
            handleClientModalClose(true); // Pass true to skip reload
            
            // Delete from database in background
            const token = window.storage?.getToken?.();
            if (token && window.api?.deleteClient) {
                try {
                    await window.api.deleteClient(clientId);
                    
                    // Give a moment for the deletion to settle before resuming LiveDataSync
                    setTimeout(() => {
                        if (wasLiveDataSyncRunning && window.LiveDataSync?.start && !window.LiveDataSync?.isRunning) {
                            window.LiveDataSync.start();
                        }
                    }, 1500); // 1.5 second delay to prevent shimmer from LiveDataSync refresh
                } catch (error) {
                    // On error, restore the client from original array immediately (not in startTransition)
                    setClients(originalClients);
                    safeStorage.setClients(originalClients);
                    
                    const errorMessage = error?.message || error?.error || 'Unknown error';
                    console.error('❌ Failed to delete client:', error);
                    alert('Failed to delete client: ' + errorMessage);
                    
                    // Resume LiveDataSync on error
                    if (wasLiveDataSyncRunning && window.LiveDataSync?.start && !window.LiveDataSync?.isRunning) {
                        window.LiveDataSync.start();
                    }
                    return;
                }
            } else {
                // If no API, resume LiveDataSync after a short delay
                if (wasLiveDataSyncRunning && window.LiveDataSync?.start && !window.LiveDataSync?.isRunning) {
                    setTimeout(() => {
                        window.LiveDataSync.start();
                    }, 500);
                }
            }
        } catch (error) {
            alert('Failed to delete client: ' + (error.message || 'Unknown error'));
        }
    };

    const handleDeleteLead = async (leadId) => {
        try {
            // CRITICAL: Save original leads array BEFORE filtering for error recovery
            const originalLeads = [...leads];
            
            // Optimistically update UI first for smooth removal
            const normalizedLeadId = leadId !== undefined && leadId !== null ? String(leadId) : null;
            const updatedLeads = normalizedLeadId
                ? leads.filter(l => String(l.id) !== normalizedLeadId)
                : leads;
            
            // Temporarily pause LiveDataSync to prevent conflicts
            const wasLiveDataSyncRunning = window.LiveDataSync?.isRunning;
            if (wasLiveDataSyncRunning && window.LiveDataSync?.stop) {
                window.LiveDataSync.stop();
            }
            
            // CRITICAL: Update state immediately (not in startTransition) so UI updates right away
            setLeads(updatedLeads);
            
            // CRITICAL: Close modal immediately after optimistic update, but skip reload
            // This ensures the UI shows the deletion immediately without reload overwriting it
            handleLeadModalClose(true); // Pass true to skip reload
            
            // Delete from database in background
            const token = window.storage?.getToken?.();
            if (token && window.api?.deleteLead) {
                try {
                    await window.api.deleteLead(leadId);
                    
                    // Give a moment for the deletion to settle before resuming LiveDataSync
                    setTimeout(() => {
                        if (wasLiveDataSyncRunning && window.LiveDataSync?.start && !window.LiveDataSync?.isRunning) {
                            window.LiveDataSync.start();
                        }
                    }, 1500); // 1.5 second delay to prevent shimmer from LiveDataSync refresh
                } catch (error) {
                    // Check if it's a 404 (lead already deleted) - treat as success
                    const errorMessage = error?.message || String(error);
                    const is404 = errorMessage.includes('404') || errorMessage.includes('Not found') || errorMessage.includes('not found');
                    
                    if (!is404) {
                        // On error (except 404), restore the lead from original array immediately
                        setLeads(originalLeads);
                        
                        const errorMsg = error?.message || error?.error || 'Unknown error';
                        console.error('❌ Failed to delete lead:', error);
                        alert('Failed to delete lead: ' + errorMsg);
                        
                        // Resume LiveDataSync on error
                        if (wasLiveDataSyncRunning && window.LiveDataSync?.start && !window.LiveDataSync?.isRunning) {
                            window.LiveDataSync.start();
                        }
                        return;
                    } else {
                        // 404 means lead was already deleted - this is fine, just resume sync
                        if (wasLiveDataSyncRunning && window.LiveDataSync?.start && !window.LiveDataSync?.isRunning) {
                            setTimeout(() => {
                                window.LiveDataSync.start();
                            }, 1500);
                        }
                    }
                }
            } else {
                // If no API, resume LiveDataSync after a short delay
                if (wasLiveDataSyncRunning && window.LiveDataSync?.start && !window.LiveDataSync?.isRunning) {
                    setTimeout(() => {
                        window.LiveDataSync.start();
                    }, 500);
                }
            }
        } catch (error) {
            console.error('❌ Error deleting lead:', error);
            alert('Failed to delete lead: ' + (error.message || 'Unknown error'));
        }
    };

    // PERFORMANCE FIX: Memoize event handlers to prevent unnecessary re-renders
    const handleSort = useCallback((field) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    }, [sortField, sortDirection]);

    // PERFORMANCE FIX: Memoize lead sort handler
    const handleLeadSort = useCallback((field) => {
        if (leadSortField === field) {
            setLeadSortDirection(leadSortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setLeadSortField(field);
            setLeadSortDirection('asc');
        }
    }, [leadSortField, leadSortDirection]);

    // PERFORMANCE FIX: Memoize sort functions to prevent recreation on every render
    const sortClients = useCallback((clients) => {
        // CRITICAL: Preserve groupMemberships by creating a map before sorting
        const clientsMap = new Map(clients.map(c => [c.id, c]));
        
        // Sort clients - spread operator preserves all properties including groupMemberships
        const sorted = [...clients].sort((a, b) => {
            // Prioritize starred items at the top
            const aStarred = resolveStarredState(a);
            const bStarred = resolveStarredState(b);
            if (aStarred !== bStarred) {
                return bStarred ? 1 : -1; // Starred items come first
            }
            
            let aValue = a[sortField];
            let bValue = b[sortField];
            
            // Handle date fields
            if (sortField === 'lastContact') {
                aValue = new Date(aValue || 0);
                bValue = new Date(bValue || 0);
            }
            
            // Handle Company Group sorting
            if (sortField === 'companyGroup') {
                // Extract group names from groupMemberships (check ref first)
                const getGroupNames = (client) => {
                    // Priority 1: Check ref (restored groups that should never be cleared)
                    let memberships = [];
                    if (restoredGroupMembershipsRef.current.has(client.id)) {
                        const restoredGroups = restoredGroupMembershipsRef.current.get(client.id);
                        if (restoredGroups && Array.isArray(restoredGroups) && restoredGroups.length > 0) {
                            memberships = restoredGroups;
                        }
                    }
                    
                    // Priority 2: Use client's groupMemberships if ref doesn't have them
                    if (memberships.length === 0) {
                        memberships = client.groupMemberships;
                    }

                    const groupNames = resolveGroupNames({
                        ...client,
                        groupMemberships: memberships
                    });
                    return groupNames.length > 0 ? groupNames.join(', ') : 'None';
                };
                aValue = getGroupNames(a);
                bValue = getGroupNames(b);
            }
            
            // Handle Services sorting (sort by first service name or count)
            if (sortField === 'services') {
                const getServicesValue = (client) => {
                    const services = Array.isArray(client.services)
                        ? client.services
                        : (typeof client.services === 'string' ? (()=>{ try { return JSON.parse(client.services||'[]'); } catch { return []; } })() : []);
                    if (services.length === 0) return 'None';
                    const firstService = services[0];
                    // Extract string from service (handles both objects and strings)
                    if (typeof firstService === 'string') return firstService;
                    if (typeof firstService === 'object' && firstService !== null) {
                        return firstService.name || firstService.id || firstService.description || 'None';
                    }
                    return String(firstService || 'None');
                };
                aValue = getServicesValue(a);
                bValue = getServicesValue(b);
            }
            
            // Convert to strings for comparison
            if (typeof aValue === 'string') aValue = aValue.toLowerCase();
            if (typeof bValue === 'string') bValue = bValue.toLowerCase();
            
            // Handle null/undefined values
            if (aValue == null) aValue = '';
            if (bValue == null) bValue = '';
            
            if (sortDirection === 'asc') {
                return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
            } else {
                return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
            }
        });
        
        // CRITICAL: Restore groupMemberships from original clients AND ref to ensure they're preserved
        return sorted.map(client => {
            const original = clientsMap.get(client.id);
            
            // Priority 1: Check ref (restored groups that should never be cleared)
            let finalGroupMemberships = [];
            if (restoredGroupMembershipsRef.current.has(client.id)) {
                const restoredGroups = restoredGroupMembershipsRef.current.get(client.id);
                if (restoredGroups && Array.isArray(restoredGroups) && restoredGroups.length > 0) {
                    finalGroupMemberships = [...restoredGroups];
                }
            }
            
            // Priority 2: Use original client's groupMemberships if ref doesn't have them
            if (finalGroupMemberships.length === 0 && original) {
                if (Array.isArray(original.groupMemberships) && original.groupMemberships.length > 0) {
                    finalGroupMemberships = [...original.groupMemberships];
                } else if (Array.isArray(client.groupMemberships) && client.groupMemberships.length > 0) {
                    finalGroupMemberships = [...client.groupMemberships];
                }
            }
            
            if (original) {
                // Preserve all properties from original, especially groupMemberships from ref or original
                return {
                    ...client,
                    groupMemberships: finalGroupMemberships
                };
            }
            return {
                ...client,
                groupMemberships: finalGroupMemberships
            };
        });
    }, [sortField, sortDirection]);

    // PERFORMANCE FIX: Memoize sort function for leads
    const sortLeads = useCallback((leads) => {
        return [...leads].sort((a, b) => {
            // Prioritize starred items at the top
            const aStarred = resolveStarredState(a);
            const bStarred = resolveStarredState(b);
            if (aStarred !== bStarred) {
                return bStarred ? 1 : -1; // Starred items come first
            }
            
            let aValue = a[leadSortField];
            let bValue = b[leadSortField];
            
            // Handle date fields
            if (leadSortField === 'firstContactDate' || leadSortField === 'lastContact') {
                aValue = new Date(aValue || 0);
                bValue = new Date(bValue || 0);
            }
            
            // Handle stage sorting (No Engagement < Awareness < Interest < Desire < Action)
            if (leadSortField === 'stage') {
                const stageOrder = { 'No Engagement': 0, 'Awareness': 1, 'Interest': 2, 'Desire': 3, 'Action': 4 };
                aValue = stageOrder[aValue] || 0;
                bValue = stageOrder[bValue] || 0;
            }
            
            // Handle Company Group sorting
            if (leadSortField === 'companyGroup') {
                // Extract group names from groupMemberships
                const getGroupNames = (lead) => {
                    const groupNames = resolveGroupNames(lead);
                    return groupNames.length > 0 ? groupNames.join(', ') : 'None';
                };
                aValue = getGroupNames(a);
                bValue = getGroupNames(b);
            }
            
            // Convert to strings for comparison
            if (typeof aValue === 'string') aValue = aValue.toLowerCase();
            if (typeof bValue === 'string') bValue = bValue.toLowerCase();
            
            if (leadSortDirection === 'asc') {
                return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
            } else {
                return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
            }
        });
    }, [leadSortField, leadSortDirection]);

    // PERFORMANCE FIX: Memoize filtered clients to prevent recalculation on every render
    const filteredClients = useMemo(() => {
        return clients.filter(client => {
            // Include clients with type='client' OR null/undefined (legacy clients without type field)
            // This matches the logic in loadClients() which includes legacy clients
            if (client.type !== 'client' && client.type !== null && client.type !== undefined) {
                return false; // Exclude leads or any other type value
            }
            
                // Additional safeguard: exclude records with status='Potential' (always a lead)
                // This catches leads that might have been incorrectly saved with type='client'
                if (client.status === 'Potential') {
                    return false;
                }
            
            // Enhanced search across multiple fields
            const searchLower = searchTerm.toLowerCase();
            const services = Array.isArray(client.services)
                ? client.services
                : (typeof client.services === 'string' ? (()=>{ try { return JSON.parse(client.services||'[]'); } catch { return []; } })() : []);
            // Helper function to extract string from service (handles both objects and strings)
            const getServiceString = (service) => {
                if (typeof service === 'string') return service;
                if (typeof service === 'object' && service !== null) {
                    return service.name || service.id || service.description || JSON.stringify(service);
                }
                return String(service || '');
            };
            const matchesSearch = searchTerm === '' || 
                client.name.toLowerCase().includes(searchLower) ||
                client.industry.toLowerCase().includes(searchLower) ||
                client.address.toLowerCase().includes(searchLower) ||
                client.website.toLowerCase().includes(searchLower) ||
                client.notes.toLowerCase().includes(searchLower) ||
                // Search in services
                services.some(service => 
                    getServiceString(service).toLowerCase().includes(searchLower)
                ) ||
                // Search in all contacts
                (client.contacts || []).some(contact => 
                    contact.name.toLowerCase().includes(searchLower) ||
                    contact.email.toLowerCase().includes(searchLower) ||
                    contact.phone.includes(searchTerm)
                ) ||
                // Search in all sites
                (client.sites || []).some(site => 
                    site.name.toLowerCase().includes(searchLower) ||
                    site.address.toLowerCase().includes(searchLower)
                );
            
            const matchesIndustry = filterIndustry === 'All Industries' || client.industry === filterIndustry;
            // Normalize status for comparison
            const clientStatus = client.status ? (client.status.charAt(0).toUpperCase() + client.status.slice(1).toLowerCase()) : '';
            const matchesStatus = filterStatus === 'All Status' || clientStatus === filterStatus;
            
            // Check if client matches selected services (if any are selected)
            const matchesServices = filterServices.length === 0 || 
                services.some(service => filterServices.includes(service));
            
            // Check if starred filter is applied
            const matchesStarred = !showStarredOnly || resolveStarredState(client);
            
            return matchesSearch && matchesIndustry && matchesStatus && matchesServices && matchesStarred;
        });
    }, [clients, searchTerm, filterIndustry, filterStatus, filterServices, showStarredOnly]);

    // PERFORMANCE FIX: Memoize sorted clients
    const sortedClients = useMemo(() => {
        return sortClients(filteredClients);
    }, [filteredClients, sortClients]);

    // PERFORMANCE FIX: Memoize filtered leads
    const filteredLeads = useMemo(() => {
        return leads.filter(lead => {
            const matchesSearch = searchTerm === '' || 
                lead.name.toLowerCase().includes(searchTerm.toLowerCase());
                // Contact search removed for leads
            
            const matchesIndustry = filterIndustry === 'All Industries' || lead.industry === filterIndustry;
            
            // Status filter - normalize for comparison
            const leadStatus = lead.status ? (lead.status.charAt(0).toUpperCase() + lead.status.slice(1).toLowerCase()) : '';
            const matchesStatus = filterStatus === 'All Status' || leadStatus === filterStatus;
            
            // Stage filter - normalize for comparison
            const leadStage = lead.stage ? (lead.stage.charAt(0).toUpperCase() + lead.stage.slice(1).toLowerCase()) : '';
            const matchesStage = filterStage === 'All Stages' || leadStage === filterStage;
            
            // Check if starred filter is applied
            const matchesStarred = !showStarredOnly || resolveStarredState(lead);
            
            return matchesSearch && matchesIndustry && matchesStatus && matchesStage && matchesStarred;
        });
    }, [leads, searchTerm, filterIndustry, filterStatus, filterStage, showStarredOnly]);

    // PERFORMANCE FIX: Memoize sorted leads
    const sortedLeads = useMemo(() => {
        return sortLeads(filteredLeads);
    }, [filteredLeads, leadSortField, leadSortDirection]);

    // Helper function to check if a client has groups
    const clientHasGroups = useCallback((client) => {
        // Check ref first (restored groups)
        if (restoredGroupMembershipsRef.current.has(client.id)) {
            const restoredGroups = restoredGroupMembershipsRef.current.get(client.id);
            if (restoredGroups && Array.isArray(restoredGroups) && restoredGroups.length > 0) {
                return true;
            }
        }
        
        // Check state groupMemberships
        if (Array.isArray(client.groupMemberships) && client.groupMemberships.length > 0) {
            return true;
        }
        
        // Check companyGroup field (legacy support)
        if (client.companyGroup && client.companyGroup.trim() !== '') {
            return true;
        }
        
        return false;
    }, []);

    // Calculate total grouped clients count (before filters)
    // Load groups from API
    const isLoadingGroupsRef = useRef(false);
    const loadGroups = useCallback(async (forceRefresh = false) => {
        if (isLoadingGroupsRef.current && !forceRefresh) {
            return; // Already loading, skip duplicate call
        }
        
        // Throttle API calls - prevent too frequent requests
        const now = Date.now();
        const timeSinceLastCall = now - lastGroupsApiCallTimestamp;
        if (!forceRefresh && timeSinceLastCall < GROUPS_API_CALL_INTERVAL) {
            // Still show cached data if available (but only if not already set)
            const cachedGroups = safeStorage.getGroups();
            if (cachedGroups && cachedGroups.length > 0) {
                // Only update if different from current state to prevent unnecessary re-renders
                startTransition(() => {
                    setGroups(prevGroups => {
                        if (prevGroups.length === cachedGroups.length &&
                            prevGroups.every((g, i) => g?.id === cachedGroups[i]?.id)) {
                            return prevGroups; // No change
                        }
                        return cachedGroups;
                    });
                });
            }
            return;
        }
        
        // If not forcing refresh, try cache first for instant loading
        if (!forceRefresh) {
            const cachedGroups = safeStorage.getGroups();
            if (cachedGroups && cachedGroups.length > 0) {
                // Only update if different from current state
                setGroups(prevGroups => {
                    if (prevGroups.length === cachedGroups.length &&
                        prevGroups.every((g, i) => g?.id === cachedGroups[i]?.id)) {
                        return prevGroups; // No change
                    }
                    return cachedGroups;
                });
                groupsLoadedRef.current = true;
                // Still fetch in background to update cache, but only if enough time has passed
                if (timeSinceLastCall >= GROUPS_API_CALL_INTERVAL) {
                    forceRefresh = true;
                } else {
                    return; // Skip API call if too soon
                }
            }
        }
        
        try {
            isLoadingGroupsRef.current = true;
            setIsLoadingGroups(true);
            const token = window.storage?.getToken?.();
            if (!token) {
                console.warn('⚠️ No token available for fetching groups');
                setIsLoadingGroups(false);
                return;
            }
            
            // Use RateLimitManager to throttle the request
            const fetchGroups = async () => {
                const response = await fetch('/api/clients/groups', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include'
                });
                
                if (response.ok) {
                    const data = await response.json();
                    // Response structure: { data: { groups: [...] } } or { groups: [...] }
                    const groupsList = data?.data?.groups || data?.groups || [];
                    // Use startTransition for background updates to prevent jittering
                    startTransition(() => {
                        setGroups(prevGroups => {
                            // Only update if data actually changed
                            if (prevGroups.length === groupsList.length &&
                                prevGroups.every((g, i) => g?.id === groupsList[i]?.id)) {
                                return prevGroups; // No change, return previous to prevent re-render
                            }
                            return groupsList;
                        });
                    });
                    // Save to cache for instant loading next time (non-blocking)
                    safeStorage.setGroups(groupsList);
                    groupsLoadedRef.current = true;
                } else {
                    const errorText = await response.text().catch(() => 'Unknown error');
                    
                    // Handle rate limit errors gracefully
                    if (response.status === 429) {
                        const retryAfter = response.headers.get('Retry-After') || '60';
                        const waitSeconds = parseInt(retryAfter, 10);
                        const waitMinutes = Math.round(waitSeconds / 60);
                        console.warn(`⏸️ Rate limit active. Please wait ${waitMinutes} minute(s) before trying again.`);
                        
                        // Update RateLimitManager if available
                        if (window.RateLimitManager) {
                            window.RateLimitManager.setRateLimit(waitSeconds);
                        }
                    } else {
                        console.error('❌ Failed to load groups:', response.status, response.statusText, errorText);
                    }
                    // Don't clear groups on error if we have cached data
                    const cachedGroups = safeStorage.getGroups();
                    if (!cachedGroups || cachedGroups.length === 0) {
                        setGroups([]);
                    }
                    groupsLoadedRef.current = true; // Mark as loaded even on error to prevent retry loops
                }
            };
            
            // Update timestamp before making the call to prevent concurrent requests
            lastGroupsApiCallTimestamp = Date.now();
            
            // Use RateLimitManager to throttle the request
            if (window.RateLimitManager) {
                await window.RateLimitManager.throttleRequest(fetchGroups, 2); // Priority 2 for background loads
            } else {
                await fetchGroups();
            }
        } catch (error) {
            console.error('❌ Error loading groups:', error);
            // Don't clear groups on error if we have cached data
            const cachedGroups = safeStorage.getGroups();
            if (!cachedGroups || cachedGroups.length === 0) {
                setGroups([]);
            }
            groupsLoadedRef.current = true; // Mark as loaded even on error to prevent retry loops
        } finally {
            isLoadingGroupsRef.current = false;
            setIsLoadingGroups(false);
        }
    }, []); // Empty deps - function is stable and uses refs for state

    // Load group members for a specific group
    const isLoadingGroupMembersRef = useRef(false);
    const lastGroupMembersRequestRef = useRef(null); // Track last request to prevent duplicates
    const loadGroupMembersDebounceRef = useRef(null); // Debounce ref
    const loadGroupMembers = useCallback(async (groupId) => {
        // Debounce rapid clicks - cancel previous request if clicking again within 500ms
        if (loadGroupMembersDebounceRef.current) {
            clearTimeout(loadGroupMembersDebounceRef.current);
        }
        
        return new Promise((resolve) => {
            loadGroupMembersDebounceRef.current = setTimeout(async () => {
                // Check if this is the same group we just loaded
                if (lastGroupMembersRequestRef.current === groupId && isLoadingGroupMembersRef.current) {
                    resolve();
                    return; // Already loading, skip duplicate call
                }
                
                if (isLoadingGroupMembersRef.current) {
                    resolve();
                    return; // Already loading, skip duplicate call
                }
                
                try {
                    isLoadingGroupMembersRef.current = true;
                    lastGroupMembersRequestRef.current = groupId;
                    setIsLoadingGroupMembers(true);
                    setGroupMembersError(null); // Clear previous errors
                    const token = window.storage?.getToken?.();
                    if (!token) {
                        console.warn('⚠️ No token available for fetching group members');
                        const error = { message: 'Authentication required', type: 'auth' };
                        setGroupMembersError(error);
                        isLoadingGroupMembersRef.current = false;
                        setIsLoadingGroupMembers(false);
                        resolve();
                        return;
                    }
                    
                    // Use RateLimitManager to throttle the request
                    const fetchMembers = async () => {
                        const response = await fetch(`/api/clients/groups/${groupId}/members`, {
                            method: 'GET',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            },
                            credentials: 'include'
                        });
                        
                        if (response.ok) {
                            const data = await response.json();
                            const members = data?.data?.members || data?.members || [];
                            setGroupMembers(members);
                            setGroupMembersError(null); // Clear any previous errors
                        } else {
                            const errorText = await response.text().catch(() => 'Unknown error');
                            
                            // Handle rate limit errors gracefully
                            if (response.status === 429) {
                                const retryAfter = response.headers.get('Retry-After') || '60';
                                const waitSeconds = parseInt(retryAfter, 10);
                                const waitMinutes = Math.round(waitSeconds / 60);
                                console.warn(`⏸️ Rate limit active. Please wait ${waitMinutes} minute(s) before trying again.`);
                                
                                // Update RateLimitManager if available
                                if (window.RateLimitManager) {
                                    window.RateLimitManager.setRateLimit(waitSeconds);
                                }
                                
                                // Set error state for UI
                                setGroupMembersError({
                                    message: `Rate limit exceeded. Please wait ${waitMinutes} minute(s) before trying again.`,
                                    type: 'rate_limit',
                                    retryAfter: waitSeconds,
                                    retryAfterMinutes: waitMinutes
                                });
                            } else {
                                console.error('❌ Failed to load group members:', response.status, response.statusText, errorText);
                                setGroupMembersError({
                                    message: `Failed to load group members: ${response.statusText || 'Unknown error'}`,
                                    type: 'error',
                                    status: response.status
                                });
                            }
                            setGroupMembers([]);
                        }
                    };
                    
                    // Use RateLimitManager to throttle the request
                    if (window.RateLimitManager) {
                        await window.RateLimitManager.throttleRequest(fetchMembers, 1); // Priority 1 for user-initiated actions
                    } else {
                        await fetchMembers();
                    }
                } catch (error) {
                    // Handle rate limit errors from RateLimitManager
                    if (error.status === 429 || error.code === 'RATE_LIMIT_EXCEEDED') {
                        const waitSeconds = error.retryAfter || 60;
                        const waitMinutes = Math.round(waitSeconds / 60);
                        setGroupMembersError({
                            message: `Rate limit exceeded. Please wait ${waitMinutes} minute(s) before trying again.`,
                            type: 'rate_limit',
                            retryAfter: waitSeconds,
                            retryAfterMinutes: waitMinutes
                        });
                    } else {
                        console.error('❌ Error loading group members:', error);
                        setGroupMembersError({
                            message: error.message || 'Failed to load group members',
                            type: 'error'
                        });
                    }
                    setGroupMembers([]);
                } finally {
                    isLoadingGroupMembersRef.current = false;
                    setIsLoadingGroupMembers(false);
                    resolve();
                }
            }, 300); // 300ms debounce to prevent rapid clicks
        });
    }, []); // Empty deps - function is stable and uses refs for state

    // Load groups when Groups tab is active OR on initial mount to show count
    // Use ref to track last loaded viewMode to prevent infinite loops
    const lastLoadedViewModeRef = useRef(null);
    const groupsLoadedRef = useRef(false);
    
    // Load groups immediately on mount (from cache first, then API in background)
    // This ensures groups count is available instantly when clicking CRM
    // Groups are already initialized from cache in useState, so only refresh if needed
    useEffect(() => {
        // Groups are already initialized from cache in useState initializer
        // Only refresh from API in background if cache is stale or empty
        // Use startTransition to prevent jittering during background refresh
        const cachedGroups = safeStorage.getGroups();
        if (!cachedGroups || cachedGroups.length === 0) {
            // No cache available, load from API (but in background)
            startTransition(() => {
                loadGroups(false);
            });
        } else {
            // Cache exists, refresh in background only if enough time has passed
            const cacheTimestamp = localStorage.getItem('abcotronics_groups_timestamp');
            const timeSinceCache = cacheTimestamp ? Date.now() - parseInt(cacheTimestamp, 10) : Infinity;
            if (timeSinceCache >= GROUPS_API_CALL_INTERVAL) {
                // Cache is stale, refresh in background
                startTransition(() => {
                    loadGroups(false); // Will use cache first, then refresh from API
                });
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Run once on mount
    
    // Load groups when Groups tab or Leads tab is active (Leads needs groups for Company Group dropdown)
    useEffect(() => {
        if (viewMode === 'groups' && lastLoadedViewModeRef.current !== 'groups') {
            lastLoadedViewModeRef.current = 'groups';
            loadGroups(true);
        } else if (viewMode === 'leads' && groups.length === 0) {
            loadGroups(false);
        } else if (viewMode !== 'groups' && viewMode !== 'leads') {
            lastLoadedViewModeRef.current = null;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewMode, groups.length]); // Only depend on viewMode and groups.length, not loadGroups to prevent infinite loops

    // Filter groups (actual group entities, not clients with groups)
    const filteredGroups = useMemo(() => {
        return groups.filter(group => {
            // Apply search filter
            const searchLower = searchTerm.toLowerCase();
            const matchesSearch = searchTerm === '' || 
                group.name.toLowerCase().includes(searchLower) ||
                (group.industry || '').toLowerCase().includes(searchLower);
            
            // Apply industry filter
            const matchesIndustry = filterIndustry === 'All Industries' || group.industry === filterIndustry;
            
            return matchesSearch && matchesIndustry;
        });
    }, [groups, searchTerm, filterIndustry]);

    // PERFORMANCE FIX: Memoize sorted groups
    const sortedGroups = useMemo(() => {
        // Sort groups by name (ascending by default)
        const sorted = [...filteredGroups].sort((a, b) => {
            if (sortField === 'name') {
                const comparison = a.name.localeCompare(b.name);
                return sortDirection === 'asc' ? comparison : -comparison;
            }
            if (sortField === 'industry') {
                const aIndustry = a.industry || '';
                const bIndustry = b.industry || '';
                const comparison = aIndustry.localeCompare(bIndustry);
                return sortDirection === 'asc' ? comparison : -comparison;
            }
            if (sortField === 'members') {
                const aCount = (a._count?.childCompanies || 0) + (a._count?.groupChildren || 0);
                const bCount = (b._count?.childCompanies || 0) + (b._count?.groupChildren || 0);
                return sortDirection === 'asc' ? aCount - bCount : bCount - aCount;
            }
            // Default: sort by name
            return a.name.localeCompare(b.name);
        });
        return sorted;
    }, [filteredGroups, sortField, sortDirection]);

    // PERFORMANCE FIX: Memoize pagination calculations
    const paginationData = useMemo(() => {
        const clientsStartIndex = (clientsPage - 1) * ITEMS_PER_PAGE;
        const clientsEndIndex = clientsStartIndex + ITEMS_PER_PAGE;
        const paginatedClients = sortedClients.slice(clientsStartIndex, clientsEndIndex);
        const totalClientsPages = Math.ceil(sortedClients.length / ITEMS_PER_PAGE);

        const leadsStartIndex = (leadsPage - 1) * ITEMS_PER_PAGE;
        const leadsEndIndex = leadsStartIndex + ITEMS_PER_PAGE;
        const paginatedLeads = sortedLeads.slice(leadsStartIndex, leadsEndIndex);
        const totalLeadsPages = Math.ceil(sortedLeads.length / ITEMS_PER_PAGE);
        
        const groupsStartIndex = (groupsPage - 1) * ITEMS_PER_PAGE;
        const groupsEndIndex = groupsStartIndex + ITEMS_PER_PAGE;
        const paginatedGroups = sortedGroups.slice(groupsStartIndex, groupsEndIndex);
        const totalGroupsPages = Math.ceil(sortedGroups.length / ITEMS_PER_PAGE);
        
        return {
            paginatedClients,
            totalClientsPages,
            paginatedLeads,
            totalLeadsPages,
            paginatedGroups,
            totalGroupsPages,
            clientsStartIndex,
            clientsEndIndex,
            leadsStartIndex,
            leadsEndIndex,
            groupsStartIndex,
            groupsEndIndex
        };
    }, [sortedClients, sortedLeads, sortedGroups, clientsPage, leadsPage, groupsPage]);
    
    const { paginatedClients, totalClientsPages, paginatedLeads, totalLeadsPages, paginatedGroups, totalGroupsPages, clientsStartIndex, clientsEndIndex, leadsStartIndex, leadsEndIndex, groupsStartIndex, groupsEndIndex } = paginationData;

    // When "Show sites" is on, fetch sites only for visible clients that lack sites from list API.
    // Use clientSites/parsedSites/sites from list when available to avoid N+1. Cap at 5 fetches
    // and run sequentially with delay to prevent 429s.
    useEffect(() => {
        if (viewMode !== 'clients' || !showSitesInClientsList || !paginatedClients?.length) return;
        if (window.RateLimitManager?.isRateLimited?.()) return;
        const token = window.storage?.getToken?.();
        if (!token) return;
        const clientById = new Map(paginatedClients.map(c => [c.id, c]));
        const hasSitesFromList = (id) => {
            const c = clientById.get(id);
            if (!c) return false;
            const s = c.parsedSites ?? c.sites ?? c.clientSites;
            return Array.isArray(s) && s.length > 0;
        };
        const ids = paginatedClients.map(c => c.id).filter(Boolean);
        const toFetch = ids.filter(id => sitesForList[id] === undefined && !hasSitesFromList(id));
        if (toFetch.length === 0) return;
        const capped = toFetch.slice(0, 5);
        let cancelled = false;
        const run = async () => {
            const results = [];
            for (const clientId of capped) {
                if (cancelled || window.RateLimitManager?.isRateLimited?.()) break;
                try {
                    const res = await fetch(`/api/sites/client/${encodeURIComponent(clientId)}`, {
                        headers: { Authorization: `Bearer ${token}` },
                        credentials: 'include'
                    });
                    if (!res.ok || cancelled) { results.push({ clientId, sites: [] }); continue; }
                    const data = await res.json();
                    const sites = data?.data?.sites ?? data?.sites ?? [];
                    results.push({ clientId, sites: Array.isArray(sites) ? sites : [] });
                } catch {
                    results.push({ clientId, sites: [] });
                }
                await new Promise(r => setTimeout(r, 400));
            }
            if (cancelled) return;
            setSitesForList(prev => {
                const next = { ...prev };
                results.forEach(({ clientId, sites }) => { next[clientId] = sites; });
                return next;
            });
        };
        run();
        return () => { cancelled = true; };
    }, [viewMode, showSitesInClientsList, paginatedClients, clientsPage, sitesForList]);

    // Extract all unique services from clients and leads for filter dropdown
    const allServices = useMemo(() => {
        const serviceSet = new Set();
        [...clients, ...leads].forEach(item => {
            const itemServices = Array.isArray(item.services)
                ? item.services
                : (typeof item.services === 'string' ? (()=>{ try { return JSON.parse(item.services||'[]'); } catch { return []; } })() : []);
            itemServices.forEach(service => serviceSet.add(service));
        });
        return Array.from(serviceSet).sort();
    }, [clients, leads]);

    // Extract all unique status values from clients and leads dynamically
    const allStatuses = useMemo(() => {
        const statusSet = new Set();
        [...clients, ...leads].forEach(item => {
            if (item.status && typeof item.status === 'string' && item.status.trim()) {
                // Normalize status: capitalize first letter, rest lowercase
                const normalized = item.status.charAt(0).toUpperCase() + item.status.slice(1).toLowerCase();
                statusSet.add(normalized);
            }
        });
        return Array.from(statusSet).sort();
    }, [clients, leads]);

    // Extract all unique stage values from leads dynamically
    const allStages = useMemo(() => {
        const stageSet = new Set();
        leads.forEach(lead => {
            if (lead.stage && typeof lead.stage === 'string' && lead.stage.trim()) {
                // Normalize stage: capitalize first letter, rest lowercase
                const normalized = lead.stage.charAt(0).toUpperCase() + lead.stage.slice(1).toLowerCase();
                stageSet.add(normalized);
            }
        });
        // Ensure all PIPELINE_STAGES are included even if not in data yet
        PIPELINE_STAGES.forEach(stage => stageSet.add(stage));
        return Array.from(stageSet).sort();
    }, [leads]);

    // Extract all unique industries from clients and leads dynamically (as fallback/supplement to API)
    const allIndustriesFromData = useMemo(() => {
        const industrySet = new Set();
        [...clients, ...leads].forEach(item => {
            if (item.industry && typeof item.industry === 'string' && item.industry.trim()) {
                industrySet.add(item.industry.trim());
            }
        });
        return Array.from(industrySet).sort();
    }, [clients, leads]);

    // Combine API industries with data industries to ensure all current options are available
    const allIndustries = useMemo(() => {
        const industrySet = new Set();
        // Add industries from API
        industries.forEach(ind => {
            if (ind.name) industrySet.add(ind.name);
        });
        // Add industries from actual data
        allIndustriesFromData.forEach(ind => industrySet.add(ind));
        return Array.from(industrySet).sort();
    }, [industries, allIndustriesFromData]);

    // Reset page to 1 when filters or sort changes
    useEffect(() => {
        setClientsPage(1);
        setLeadsPage(1);
        setGroupsPage(1);
    }, [searchTerm, filterIndustry, filterStatus, filterStage, filterServices, showStarredOnly, sortField, sortDirection, leadSortField, leadSortDirection]);

    const pipelineStages = ['Awareness', 'Interest', 'Desire', 'Action'];

    const openLeadFromPipeline = useCallback(async ({ leadId, leadData, siteId } = {}) => {
        const resolvedLeadId = leadId || leadData?.id;
        if (!resolvedLeadId) return;

        let lead = leadData;

        if (!lead && Array.isArray(leadsRef.current)) {
            lead = leadsRef.current.find(l => l.id === resolvedLeadId) || null;
        }

        if (!lead && window.api?.getLead) {
            try {
                const response = await window.api.getLead(resolvedLeadId);
                lead = response?.data?.lead || response?.lead || response || null;
            } catch (error) {
                // Silently fail - lead fetch is non-critical
            }
        }

        if (siteId) {
            setOpenSiteIdForLead(siteId);
            setCurrentLeadTab('sites');
        }
        handleOpenLead(lead || null, { fromPipeline: true, leadId: resolvedLeadId });
    }, [handleOpenLead]);

    const openClientFromPipeline = useCallback(async ({ clientId, clientData, siteId, site } = {}) => {
        const resolvedClientId = clientId || clientData?.id;
        if (!resolvedClientId) return;
        try {
            sessionStorage.setItem('returnToPipeline', 'true');
        } catch (_) {}
        let client = clientData;
        if (!client && Array.isArray(clientsRef.current)) {
            client = clientsRef.current.find(c => c.id === resolvedClientId) || null;
        }
        if (!client && window.DatabaseAPI?.getClient) {
            try {
                const response = await window.DatabaseAPI.getClient(resolvedClientId);
                client = response?.data?.client ?? response?.client ?? response?.data ?? response ?? null;
            } catch (_) {}
        }
        if (!client) return;
        let resolvedSite = site;
        if (!resolvedSite && siteId && Array.isArray(client.sites)) {
            resolvedSite = client.sites.find(s => s.id === siteId) || null;
        }
        if (!resolvedSite && siteId && Array.isArray(client.clientSites)) {
            resolvedSite = client.clientSites.find(s => s.id === siteId) || null;
        }
        handleOpenClientToSite(client, resolvedSite || { id: siteId });
    }, [handleOpenClientToSite]);

    const openOpportunityFromPipeline = useCallback(async ({ opportunityId, clientId, clientName, opportunity } = {}) => {
        const resolvedOpportunityId = opportunityId || opportunity?.id;
        if (!resolvedOpportunityId) return;

        try {
            sessionStorage.setItem('returnToPipeline', 'true');
        } catch (error) {
            // Silently fail - sessionStorage access is non-critical
        }

        stopSync();

        const resolvedClientId = clientId || opportunity?.clientId || opportunity?.client?.id || null;
        let client = null;

        if (resolvedClientId && Array.isArray(clientsRef.current)) {
            client = clientsRef.current.find(c => c.id === resolvedClientId) || null;
        }

        if (!client && resolvedClientId && window.DatabaseAPI?.getClient) {
            try {
                const response = await window.DatabaseAPI.getClient(resolvedClientId);
                client = response?.data?.client || response?.client || response || null;
            } catch (error) {
                // Silently fail - client fetch is non-critical
            }
        }

        const fallbackClient = client || ((resolvedClientId || clientName || opportunity?.clientName)
            ? {
                id: resolvedClientId || resolvedOpportunityId,
                name: clientName || opportunity?.clientName || opportunity?.client?.name || opportunity?.name || 'Opportunity'
            }
            : null);

        setSelectedOpportunityId(resolvedOpportunityId);
        setSelectedOpportunityClient(fallbackClient);
        setViewMode('opportunity-detail');
    }, [stopSync]);

    // Handle star toggle for clients/leads
    const handleToggleStar = async (e, clientOrLead, isLead = false) => {
        e.stopPropagation(); // Prevent opening the detail modal
        
        const clientId = clientOrLead.id;
        const currentStarred = clientOrLead.isStarred || false;
        const newStarredState = !currentStarred;
        
        // Update local state optimistically first for instant UI feedback
        const updateLeadsState = (updater) => {
            setLeads(prevLeads => {
                const updated = updater(prevLeads);
                try {
                    window.storage?.setLeads?.(updated);
                } catch (error) {
                    // Silently fail - localStorage persistence is non-critical
                }
                return updated;
            });
        };

        const updateClientsState = (updater) => {
            setClients(prevClients => {
                const updated = updater(prevClients);
                try {
                    safeStorage.setClients(updated);
                } catch (error) {
                    // Silently fail - localStorage persistence is non-critical
                }
                return updated;
            });
        };

        if (isLead) {
            updateLeadsState(prevLeads =>
                prevLeads.map(l =>
                    l.id === clientId ? { ...l, isStarred: newStarredState } : l
                )
            );
        } else {
            updateClientsState(prevClients =>
                prevClients.map(c =>
                    c.id === clientId ? { ...c, isStarred: newStarredState } : c
                )
            );
        }
        
        try {
            // Prefer the main API, fall back to DatabaseAPI for backwards compatibility
            const toggleStarFn =
                (window.api && typeof window.api.toggleStarClient === 'function'
                    ? window.api.toggleStarClient
                    : (window.DatabaseAPI && typeof window.DatabaseAPI.toggleStarClient === 'function'
                        ? window.DatabaseAPI.toggleStarClient
                        : null));

            if (toggleStarFn) {
                // Call API to persist the change (non-blocking)
                toggleStarFn(clientId).then(() => {
                    // Clear cache but don't refetch - optimistic update is sufficient
                    if (window.DatabaseAPI?.clearCache) {
                        window.DatabaseAPI.clearCache('/clients');
                        window.DatabaseAPI.clearCache('/leads');
                    }
                    // Also invalidate DataContext cache if available so lists re-hydrate with fresh data
                    if (window.dataManager?.invalidate) {
                        try {
                            window.dataManager.invalidate('clients');
                            window.dataManager.invalidate('leads');
                        } catch (err) {
                            // Silently fail - cache invalidation is non-critical
                        }
                    }
                }).catch((error) => {
                    // Revert optimistic update on error
                    if (isLead) {
                        updateLeadsState(prevLeads =>
                            prevLeads.map(l =>
                                l.id === clientId ? { ...l, isStarred: currentStarred } : l
                            )
                        );
                    } else {
                        updateClientsState(prevClients =>
                            prevClients.map(c =>
                                c.id === clientId ? { ...c, isStarred: currentStarred } : c
                            )
                        );
                    }
                    alert('Failed to update star. Please try again.');
                });
            } else {
                // Revert if API not available (no star API)
                if (isLead) {
                    updateLeadsState(prevLeads =>
                        prevLeads.map(l =>
                            l.id === clientId ? { ...l, isStarred: currentStarred } : l
                        )
                    );
                } else {
                    updateClientsState(prevClients =>
                        prevClients.map(c =>
                            c.id === clientId ? { ...c, isStarred: currentStarred } : c
                        )
                    );
                }
            }
        } catch (error) {
            // Revert optimistic update on error
            if (isLead) {
                updateLeadsState(prevLeads =>
                    prevLeads.map(l =>
                        l.id === clientId ? { ...l, isStarred: currentStarred } : l
                    )
                );
            } else {
                updateClientsState(prevClients =>
                    prevClients.map(c =>
                        c.id === clientId ? { ...c, isStarred: currentStarred } : c
                    )
                );
            }
            alert('Failed to update star. Please try again.');
        }
    };
    
    // Handler to update lead's external agent
    const handleUpdateLeadExternalAgent = useCallback(async (leadId, externalAgentId) => {
        if (!leadId) return;
        
        // Store original lead for potential rollback
        let originalLead = null;
        
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Authentication required');
                return;
            }
            
            // Get original lead before updating using ref
            originalLead = leadsRef.current?.find(l => l.id === leadId);
            
            // Optimistically update local state
            setLeads(prevLeads => {
                const updated = prevLeads.map(lead => {
                    if (lead.id === leadId) {
                        const updatedLead = {
                            ...lead,
                            externalAgentId: externalAgentId,
                            externalAgent: externalAgentId 
                                ? externalAgents.find(agent => agent.id === externalAgentId) 
                                : null
                        };
                        return updatedLead;
                    }
                    return lead;
                });
                
                // Persist to storage
                try {
                    window.storage?.setLeads?.(updated);
                } catch (error) {
                    // Silently fail - localStorage persistence is non-critical
                }
                
                return updated;
            });
            
            // Update via API
            const leadDataToSend = {
                externalAgentId: externalAgentId
            };
            
            if (window.api?.updateLead) {
                try {
                    await window.api.updateLead(leadId, leadDataToSend);
                    
                    // Clear cache to ensure updates appear immediately
                    if (window.ClientCache?.clearCache) {
                        window.ClientCache.clearCache();
                    }
                    if (window.DatabaseAPI?.clearCache) {
                        window.DatabaseAPI.clearCache('/leads');
                    }
                    
                    // Trigger LiveDataSync
                    if (window.LiveDataSync?.forceSync) {
                        window.LiveDataSync.forceSync().catch(() => {
                            // Sync will happen automatically, ignore errors
                        });
                    }
                } catch (apiError) {
                    throw apiError;
                }
            } else {
                // Fallback: direct API call
                const response = await fetch(`/api/leads/${leadId}`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify(leadDataToSend)
                });
                
                if (!response.ok) {
                    throw new Error('Failed to update external agent');
                }
                
                // Clear cache
                if (window.DatabaseAPI?.clearCache) {
                    window.DatabaseAPI.clearCache('/leads');
                }
            }
        } catch (error) {
            console.error('Error updating lead external agent:', error);
            // Revert optimistic update
            if (originalLead) {
                setLeads(prevLeads => 
                    prevLeads.map(lead => 
                        lead.id === leadId ? originalLead : lead
                    )
                );
            }
            alert('Failed to update external agent. Please try again.');
        }
    }, [externalAgents]);

    const updateLeadField = useCallback(async (leadId, patch, stateUpdater) => {
        if (!leadId) return;
        const original = leadsRef.current?.find(l => l.id === leadId);
        try {
            setLeads(prev => {
                const next = prev.map(l => l.id === leadId ? stateUpdater(l) : l);
                try { window.storage?.setLeads?.(next); } catch (_) {}
                return next;
            });
            const token = window.storage?.getToken?.();
            if (!token) { alert('Authentication required'); throw new Error('auth'); }
            let response;
            if (window.api?.updateLead) {
                response = await window.api.updateLead(leadId, patch);
            } else {
                const res = await fetch(`/api/leads/${leadId}`, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(patch)
                });
                if (!res.ok) throw new Error('Update failed');
                response = await res.json().catch(() => ({}));
            }
            // Merge server response into state so list and detail stay in sync (especially sites)
            const serverLead = response?.data?.lead || response?.lead;
            if (serverLead && serverLead.id === leadId) {
                const mergedSites = Array.isArray(serverLead.sites) ? serverLead.sites : (Array.isArray(serverLead.clientSites) ? serverLead.clientSites : undefined);
                setLeads(prev => {
                    const next = prev.map(l => {
                        if (l.id !== leadId) return l;
                        const merged = { ...l, ...serverLead };
                        if (mergedSites) merged.sites = mergedSites;
                        return merged;
                    });
                    try { window.storage?.setLeads?.(next); } catch (_) {}
                    return next;
                });
                // So lead detail (Sites section) shows updated sites: keep selectedLeadRef in sync
                if (selectedLeadRef.current?.id === leadId) {
                    const merged = { ...selectedLeadRef.current, ...serverLead };
                    if (mergedSites) merged.sites = mergedSites;
                    selectedLeadRef.current = merged;
                }
            }
            if (window.ClientCache?.clearCache) window.ClientCache.clearCache();
            if (window.DatabaseAPI?.clearCache) window.DatabaseAPI.clearCache('/leads');
            if (window.LiveDataSync?.forceSync) window.LiveDataSync.forceSync().catch(() => {});
        } catch (err) {
            if (original) {
                setLeads(prev => prev.map(l => l.id === leadId ? original : l));
            }
            const message = (err && (err.message || err.details)) || 'Failed to save. Please try again.';
            alert(message);
        }
    }, []);

    const handleUpdateLeadStatus = useCallback((leadId, status) => {
        const normalized = status ? (status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()) : 'Potential';
        updateLeadField(leadId, { status: normalized }, l => ({ ...l, status: normalized }));
    }, [updateLeadField]);

    const handleUpdateLeadStage = useCallback((leadId, stage) => {
        const normalized = stage ? (stage.charAt(0).toUpperCase() + stage.slice(1).toLowerCase()) : 'Awareness';
        updateLeadField(leadId, { stage: normalized }, l => ({ ...l, stage: normalized }));
    }, [updateLeadField]);

    const handleUpdateSiteStage = useCallback((lead, site, siteIdx, newStage) => {
        const normalized = newStage ? (newStage.charAt(0).toUpperCase() + newStage.slice(1).toLowerCase()) : 'Potential';
        const currentLead = leadsRef.current?.find(l => l.id === lead.id) || lead;
        const sites = Array.isArray(currentLead.sites) ? currentLead.sites : (Array.isArray(currentLead.clientSites) ? currentLead.clientSites : []);
        const updatedSites = sites.map((s, i) => i === siteIdx ? { ...s, stage: normalized } : s);
        updateLeadField(lead.id, { sites: updatedSites }, l => ({ ...l, sites: updatedSites }));
    }, [updateLeadField]);

    const handleUpdateSiteAidaStatus = useCallback((lead, site, siteIdx, newAida) => {
        const normalized = newAida ? (newAida.charAt(0).toUpperCase() + newAida.slice(1).toLowerCase()) : 'Awareness';
        const currentLead = leadsRef.current?.find(l => l.id === lead.id) || lead;
        const sites = Array.isArray(currentLead.sites) ? currentLead.sites : (Array.isArray(currentLead.clientSites) ? currentLead.clientSites : []);
        const updatedSites = sites.map((s, i) => i === siteIdx ? { ...s, aidaStatus: normalized } : s);
        updateLeadField(lead.id, { sites: updatedSites }, l => ({ ...l, sites: updatedSites }));
    }, [updateLeadField]);

    const handleUpdateLeadCompanyGroup = useCallback((leadId, groupId) => {
        const groupIds = groupId ? [String(groupId)] : [];
        updateLeadField(leadId, { groupIds }, l => ({
            ...l,
            groupMemberships: groupId && groups.length
                ? [{ groupId, group: groups.find(g => g.id === groupId) || { id: groupId, name: '' } }]
                : []
        }));
    }, [updateLeadField, groups]);

    useEffect(() => {
        const handleLeadEvent = (event) => {
            const detail = event?.detail || {};
            if (detail.origin === 'prop') {
                return;
            }
            openLeadFromPipeline(detail);
        };

        const handleOpportunityEvent = (event) => {
            const detail = event?.detail || {};
            if (detail.origin === 'prop') {
                return;
            }
            openOpportunityFromPipeline(detail);
        };

        const handleClientEvent = (event) => {
            const detail = event?.detail || {};
            if (detail.origin === 'prop') {
                return;
            }
            openClientFromPipeline(detail);
        };

        window.addEventListener('openLeadDetailFromPipeline', handleLeadEvent);
        window.addEventListener('openOpportunityDetailFromPipeline', handleOpportunityEvent);
        window.addEventListener('openClientDetailFromPipeline', handleClientEvent);

        // Expose direct callbacks for legacy modules that prefer calling functions instead of dispatching events
        window.__openLeadDetailFromPipeline = openLeadFromPipeline;
        window.__openOpportunityDetailFromPipeline = openOpportunityFromPipeline;
        window.__openClientDetailFromPipeline = openClientFromPipeline;

        return () => {
            window.removeEventListener('openLeadDetailFromPipeline', handleLeadEvent);
            window.removeEventListener('openOpportunityDetailFromPipeline', handleOpportunityEvent);
            window.removeEventListener('openClientDetailFromPipeline', handleClientEvent);

            if (window.__openLeadDetailFromPipeline === openLeadFromPipeline) {
                delete window.__openLeadDetailFromPipeline;
            }
            if (window.__openOpportunityDetailFromPipeline === openOpportunityFromPipeline) {
                delete window.__openOpportunityDetailFromPipeline;
            }
            if (window.__openClientDetailFromPipeline === openClientFromPipeline) {
                delete window.__openClientDetailFromPipeline;
            }
        };
    }, [openLeadFromPipeline, openOpportunityFromPipeline, openClientFromPipeline]);

    const handleNavigateToProject = (projectId) => {
        // Close client detail view
        setViewMode('clients');
        selectedClientRef.current = null;
        
        // Ensure projectId is a string/number
        const projectIdStr = String(projectId);
        
        // Store in sessionStorage as backup (Projects component checks this)
        sessionStorage.setItem('openProjectId', projectIdStr);
        
        // Navigate directly to the project detail page using RouteState
        // This includes the project ID in the URL so the Projects component opens the specific project
        if (window.RouteState && window.RouteState.navigate) {
            window.RouteState.navigate({
                page: 'projects',
                segments: [projectIdStr],
                search: '',
                hash: '',
                replace: false,
                preserveSearch: false,
                preserveHash: false
            });
        } else {
            // Fallback: Navigate to projects page using the standard navigation event
            // The Projects component will check sessionStorage and open the project
            window.dispatchEvent(new CustomEvent('navigateToPage', { 
                detail: { page: 'projects' } 
            }));
        }
    };

    const convertLeadToClient = async (lead) => {
        if (!lead || !lead.id) {
            alert('Cannot convert lead: Invalid lead data');
            return;
        }

        try {
            const token = window.storage?.getToken?.();
            const newClientData = {
                name: lead.name,
                industry: lead.industry || 'Other',
                status: 'active',
                type: 'client',
                revenue: lead.value || 0,
                lastContact: new Date().toISOString().split('T')[0],
                address: lead.address || '',
                website: lead.website || '',
                notes: lead.notes || '',
                contacts: lead.contacts || [],
                followUps: [],
                projectIds: lead.projectIds || [],
                comments: lead.comments || [],
                sites: [],
                services: lead.services || [],
                activityLog: [{
                    id: Date.now(),
                    type: 'Lead Converted',
                    description: `Converted from lead: ${lead.name}`,
                    timestamp: new Date().toISOString(),
                    user: (window.storage?.getUser?.() || {}).name || 'System',
                    userId: (window.storage?.getUser?.() || {}).id || 'system',
                    userEmail: (window.storage?.getUser?.() || {}).email || 'system'
                }]
            };

            if (token && window.api?.createClient && window.api?.deleteLead) {
                // Create client from lead data
                const clientResponse = await window.api.createClient(newClientData);
                const newClient = clientResponse?.data?.client || clientResponse?.client || clientResponse?.data;
                
                // Delete the original lead
                await window.api.deleteLead(lead.id);
                
                // Refresh data from API
                await Promise.all([
                    loadClients(true).catch(() => {}),
                    loadLeads(true).catch(() => {})
                ]);
                
                setViewMode('clients');
                selectedLeadRef.current = null;
                alert('Lead converted to client successfully!');
            } else {
                // Fallback: local conversion only
                const newClient = {
                    id: Date.now().toString(),
                    ...newClientData,
                    type: 'client'
                };
                setClients([...clients, newClient]);
                const normalizedLeadId = String(lead.id);
                setLeads(prevLeads => prevLeads.filter(l => String(l.id) !== normalizedLeadId));
                // leadsCount now calculated from leads.length via useMemo
                setViewMode('clients');
                selectedLeadRef.current = null;
                alert('Lead converted to client (local only - not saved to server)');
            }
        } catch (error) {
            alert('Failed to convert lead to client: ' + (error.message || 'Unknown error'));
        }
    };

    // Legacy Pipeline View Component (fallback if new Pipeline module fails to load)
    // Kanban view removed - only shows list view
    const LegacyPipelineView = () => {
        
        // Listen for opportunity updates from ClientDetailModal
        useEffect(() => {
            const handleOpportunitiesUpdated = async (event) => {
                if (!window.DatabaseAPI?.getOpportunities) return;
                
                const { clientId } = event.detail || {};
                if (!clientId) return;
                
                // Reload all opportunities in bulk (more efficient than per-client)
                try {
                    const oppResponse = await window.DatabaseAPI.getOpportunities();
                    const allOpportunities = oppResponse?.data?.opportunities || [];
                    
                    // Group opportunities by clientId
                    const opportunitiesByClient = {};
                    allOpportunities.forEach(opp => {
                        const id = opp.clientId || opp.client?.id;
                        if (id) {
                            if (!opportunitiesByClient[id]) {
                                opportunitiesByClient[id] = [];
                            }
                            opportunitiesByClient[id].push(opp);
                        }
                    });
                    
                    // Update clients with new opportunities
                    setClients(prevClients => {
                        const updatedClients = prevClients.map(client => ({
                            ...client,
                            opportunities: opportunitiesByClient[client.id] || client.opportunities || []
                        }));
                        safeStorage.setClients(updatedClients);
                        return updatedClients;
                    });
                } catch (error) {
                    // Handle error gracefully - don't log for server errors (500s)
                    const isServerError = error?.message?.includes('500') || error?.message?.includes('Server error') || error?.message?.includes('Failed to list opportunities');
                    if (!isServerError) {
                        // Silently fail - opportunity reload is non-critical
                    }
                }
            };
            
            window.addEventListener('opportunitiesUpdated', handleOpportunitiesUpdated);
            return () => window.removeEventListener('opportunitiesUpdated', handleOpportunitiesUpdated);
        }, []); // Empty deps - only set up listener once
        
        // Listen for group assignment updates and refresh data
        useEffect(() => {
            const handleClientGroupUpdated = async (event) => {
                const { clientId, action } = event.detail || {};
                console.log('🔄 Group updated event received!');
                console.log('  - clientId:', clientId);
                console.log('  - action:', action);
                console.log('  - event detail:', event.detail);
                
                if (!clientId) {
                    console.warn('⚠️ No clientId in event, skipping refresh');
                    return;
                }
                
                // Force refresh BOTH leads and clients to get updated groupMemberships
                // A client/lead could be in either list, so refresh both to be safe
                console.log('🔄 Starting data refresh...');
                
                // Wait a moment for database transaction to commit
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // First, directly test the API to see what it returns
                try {
                    const token = window.storage?.getToken?.();
                    if (token) {
                        const testResponse = await fetch(`/api/leads`, {
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            },
                            credentials: 'include'
                        });
                        if (testResponse.ok) {
                            const testData = await testResponse.json();
                            const testLeads = testData?.data?.leads || testData?.leads || [];
                            const testLead = testLeads.find(l => l.id === clientId);
                            if (testLead) {
                                console.log('🔍 Direct API test for clientId', clientId + ':');
                                console.log('  - Found lead:', testLead.name);
                                console.log('  - groupMemberships:', JSON.stringify(testLead.groupMemberships, null, 2));
                                console.log('  - hasGroupMemberships:', !!testLead.groupMemberships);
                                console.log('  - isArray:', Array.isArray(testLead.groupMemberships));
                                console.log('  - length:', testLead.groupMemberships?.length || 0);
                            } else {
                                console.log('⚠️ Lead not found in API response for clientId:', clientId);
                            }
                        }
                    }
                } catch (testError) {
                    console.warn('⚠️ Direct API test failed:', testError);
                }
                
                try {
                    await Promise.all([
                        loadLeads(true).catch(err => {
                            console.warn('⚠️ Failed to refresh leads:', err);
                            return null;
                        }),
                        loadClients(true).catch(err => {
                            console.warn('⚠️ Failed to refresh clients:', err);
                            return null;
                        })
                    ]);
                    console.log('✅ Data refreshed after group update');
                } catch (error) {
                    console.error('❌ Error refreshing data after group update:', error);
                    console.error('  - Error details:', error.message, error.stack);
                }
            };
            
            window.addEventListener('clientGroupUpdated', handleClientGroupUpdated);
            return () => window.removeEventListener('clientGroupUpdated', handleClientGroupUpdated);
        }, []); // Empty deps - only set up listener once
        
        // PERFORMANCE FIX: Memoize expensive computations to prevent recalculation on every render
        const clientOpportunities = useMemo(() => {
            return clients.reduce((acc, client) => {
                if (client.opportunities && Array.isArray(client.opportunities)) {
                    const mapped = client.opportunities.map(opp => {
                        // Normalize stage to match pipeline stages exactly
                        let normalizedStage = 'Awareness'; // Default
                        const originalStage = opp.stage;
                        
                        if (originalStage && typeof originalStage === 'string') {
                            // Convert to title case and match to pipeline stages
                            const stageMap = {
                                'awareness': 'Awareness',
                                'interest': 'Interest',
                                'desire': 'Desire',
                                'action': 'Action',
                                'prospect': 'Awareness',
                                'new': 'Awareness',
                                'qualification': 'Interest',
                                'proposal': 'Desire',
                                'negotiation': 'Action'
                            };
                            normalizedStage = stageMap[originalStage.toLowerCase()] || 'Awareness';
                        }
                        
                        return {
                            ...opp,
                            clientName: client.name,
                            clientId: client.id,
                            type: 'opportunity',
                            stage: normalizedStage, // Use normalized stage
                            status: opp.status || 'Active', // Default to Active if no status
                            title: opp.title || opp.name || 'Untitled Opportunity',
                            value: Number(opp.value) || 0
                        };
                    });
                    return acc.concat(mapped);
                }
                return acc;
            }, []);
        }, [clients]);

        // PERFORMANCE FIX: Memoize active leads computation
        const activeLeads = useMemo(() => {
            return leads.map(lead => {
                // Normalize lead stage to match AIDA pipeline stages (same as Pipeline.jsx)
                let mappedStage = lead.stage || 'Awareness';
                const originalStage = mappedStage;
                
                // Normalize stage value - trim whitespace and handle variations
                if (mappedStage) {
                    mappedStage = mappedStage.trim();
                }
                
                // Convert common stage values to AIDA stages
                if (mappedStage === 'prospect' || mappedStage === 'new') {
                    mappedStage = 'Awareness';
                } else if (!['No Engagement', 'Awareness', 'Interest', 'Desire', 'Action'].includes(mappedStage)) {
                    // If stage doesn't match AIDA stages, default to Awareness
                    mappedStage = 'Awareness';
                }
                
                if (originalStage !== mappedStage) {
                }
                
                return { ...lead, stage: mappedStage };
            }).filter(lead => {
                // Filter out inactive leads
                return lead.status !== 'Inactive' && lead.status !== 'Disinterested';
            });
        }, [leads]);
        
        // PERFORMANCE FIX: Memoize active opportunities computation
        const activeOpportunities = useMemo(() => {
            return clientOpportunities.filter(opp => {
                const status = opp.status || 'Active'; // Default to 'Active' if no status
                return status !== 'Inactive' && status !== 'Closed Lost' && status !== 'Closed Won';
            });
        }, [clientOpportunities]);

        // Drag handlers removed - Kanban view no longer available

        return (
            <div className="space-y-6">
                {/* Stats */}
                <div className="grid grid-cols-2 sm:flex sm:gap-4 gap-2 sm:gap-4">
                    <div className={`flex-1 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-3 sm:p-4`}>
                        <div className={`text-xs sm:text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Active Leads</div>
                        <div className={`text-xl sm:text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{activeLeads.length}</div>
                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mt-1`}>New prospects</div>
                    </div>
                    <div className={`flex-1 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-3 sm:p-4`}>
                        <div className={`text-xs sm:text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Active Opportunities</div>
                        <div className={`text-xl sm:text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-primary-600'}`}>{activeOpportunities.length}</div>
                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mt-1`}>Client expansions</div>
                    </div>
                </div>

                {/* Pipeline List View - Kanban removed */}
                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border`}>
                    <div className="overflow-x-auto">
                        <table className={`w-full divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-200'}`}>
                            <thead className={isDark ? 'bg-gray-800' : 'bg-gray-50'}>
                                <tr>
                                    <th className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider`}>Name</th>
                                    <th className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider`}>Type</th>
                                    <th className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider`}>Stage</th>
                                    <th className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider`}>Status</th>
                                </tr>
                            </thead>
                            <tbody className={`${isDark ? 'bg-gray-900 divide-gray-800' : 'bg-white divide-gray-100'} divide-y`}>
                                {[...activeLeads, ...activeOpportunities].length === 0 ? (
                                    <tr>
                                        <td colSpan="4" className={`px-6 py-8 text-center text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                            <i className={`fas fa-inbox text-3xl ${isDark ? 'text-gray-600' : 'text-gray-300'} mb-2`}></i>
                                            <p>No pipeline items found</p>
                                        </td>
                                    </tr>
                                ) : (
                                    [...activeLeads, ...activeOpportunities].map((item) => (
                                        <tr 
                                            key={`${item.type}-${item.id}`}
                                            onClick={() => {
                                                if (item.type === 'lead') {
                                                    handleOpenLead(item);
                                                } else {
                                                    const client = clients.find(c => c.id === item.clientId);
                                                    openOpportunityFromPipeline({
                                                        opportunityId: item.id,
                                                        clientId: client?.id || item.clientId,
                                                        clientName: client?.name || item.clientName,
                                                        opportunity: item
                                                    });
                                                }
                                            }}
                                            className={`${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-50'} cursor-pointer transition`}
                                        >
                                            <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                {item.name || item.title || 'Untitled'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                                    item.type === 'lead' 
                                                        ? 'bg-blue-100 text-blue-700' 
                                                        : 'bg-green-100 text-green-700'
                                                }`}>
                                                    {item.type === 'lead' ? 'Lead' : 'Opportunity'}
                                                        </span>
                                            </td>
                                            <td className={`px-6 py-4 whitespace-nowrap text-sm ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                                                {item.stage || 'Awareness'}
                                            </td>
                                            <td className={`px-6 py-4 whitespace-nowrap text-sm ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                                                {item.status || 'Active'}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                                                </div>
                </div>
            </div>
        );
    };

    // Memoize parsed client data to prevent flickering during renders
    // This ensures services, groups, and sites are parsed once and remain stable
    const parsedClientsData = useMemo(() => {
        return paginatedClients.map(client => {
            // Parse services - always return array, never undefined/null
            let parsedServices = [];
            if (Array.isArray(client.services)) {
                parsedServices = client.services;
            } else if (typeof client.services === 'string') {
                try {
                    const parsed = JSON.parse(client.services || '[]');
                    parsedServices = Array.isArray(parsed) ? parsed : [];
                } catch {
                    parsedServices = [];
                }
            }
            
            // Parse groups - always return array, never undefined/null
            let parsedGroups = [];
            let groupSource = null;
            // Priority 1: Check ref (restored groups that should never be cleared)
            if (restoredGroupMembershipsRef.current.has(client.id)) {
                const restoredGroups = restoredGroupMembershipsRef.current.get(client.id);
                if (restoredGroups && Array.isArray(restoredGroups) && restoredGroups.length > 0) {
                    groupSource = restoredGroups;
                }
            }
            // Priority 2: Use state if ref doesn't have groups
            if (groupSource === null) {
                groupSource = client.groupMemberships;
            }

            parsedGroups = normalizeGroupMemberships(
                groupSource,
                client.companyGroup || client.company_group || client.groups || client.group
            );
            
            
            // Parse sites - always return array, never undefined/null (support both .sites and .clientSites from API)
            let parsedSites = [];
            const sitesSource = client.sites ?? client.clientSites;
            if (Array.isArray(sitesSource)) {
                parsedSites = sitesSource;
            } else if (typeof sitesSource === 'string') {
                try {
                    const parsed = JSON.parse(sitesSource || '[]');
                    parsedSites = Array.isArray(parsed) ? parsed : [];
                } catch {
                    parsedSites = [];
                }
            }
            
            return {
                ...client,
                parsedServices,
                parsedGroups,
                parsedSites
            };
        });
    }, [paginatedClients]); // Only recompute when paginatedClients changes

    // Helper function to extract string from service (stable reference)
    const getServiceString = useCallback((service) => {
        if (typeof service === 'string') return service;
        if (typeof service === 'object' && service !== null) {
            return service.name || service.id || service.description || JSON.stringify(service);
        }
        return String(service || '');
    }, []);
    
    // Helper function to get unique key from service (stable reference)
    const getServiceKey = useCallback((service, index) => {
        if (typeof service === 'string') return service;
        if (typeof service === 'object' && service !== null) {
            return service.id || service.name || `service-${index}`;
        }
        return `service-${index}`;
    }, []);

    // Clients List View
    const ClientsListView = () => (
        <div className={`${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} rounded-xl shadow-sm border flex flex-col h-full w-full`}>
            <div className="flex-1 overflow-auto -mx-3 sm:mx-0 px-3 sm:px-0 w-full" style={{ WebkitOverflowScrolling: 'touch' }}>
                <table className={`w-full divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-200'}`} style={{ minWidth: '640px', width: '100%' }}>
                    <thead className={isDark ? 'bg-gray-800' : 'bg-gray-50'}>
                        <tr>
                            <th 
                                className={`px-6 py-2 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider cursor-pointer ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                                onClick={() => handleSort('name')}
                            >
                                <div className="flex items-center">
                                    Client
                                    {sortField === 'name' && (
                                        <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ml-1 text-xs`}></i>
                                    )}
                                </div>
                            </th>
                            <th 
                                className={`px-6 py-2 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider cursor-pointer ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                                onClick={() => handleSort('companyGroup')}
                            >
                                <div className="flex items-center">
                                    Company Group
                                    {sortField === 'companyGroup' && (
                                        <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ml-1 text-xs`}></i>
                                    )}
                                </div>
                            </th>
                            <th 
                                className={`px-6 py-2 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider cursor-pointer ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                                onClick={() => handleSort('industry')}
                            >
                                <div className="flex items-center">
                                    Industry
                                    {sortField === 'industry' && (
                                        <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ml-1 text-xs`}></i>
                                    )}
                                </div>
                            </th>
                            <th 
                                className={`px-6 py-2 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider cursor-pointer ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                                onClick={() => handleSort('services')}
                            >
                                <div className="flex items-center">
                                Services
                                    {sortField === 'services' && (
                                        <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ml-1 text-xs`}></i>
                                    )}
                                </div>
                            </th>
                            <th 
                                className={`px-6 py-2 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider cursor-pointer ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                                onClick={() => handleSort('status')}
                            >
                                <div className="flex items-center">
                                    Status
                                    {sortField === 'status' && (
                                        <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ml-1 text-xs`}></i>
                                    )}
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody className={`${isDark ? 'bg-gray-900 divide-gray-800' : 'bg-white divide-gray-100'} divide-y`}>
                        {parsedClientsData.length === 0 ? (
                            <tr>
                                <td colSpan="5" className={`px-6 py-8 text-center text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                    <i className={`fas fa-inbox text-3xl ${isDark ? 'text-gray-600' : 'text-gray-300'} mb-2`}></i>
                                    <p>No clients found</p>
                                </td>
                            </tr>
                        ) : (
                            parsedClientsData.flatMap((client) => {
                                const sites = client.parsedSites || client.sites || sitesForList[client.id] || [];
                                const siteRows = showSitesInClientsList ? (Array.isArray(sites) ? sites : []) : [];
                                return [
                                    <tr 
                                        key={client.id} 
                                        onClick={() => handleOpenClient(client)}
                                        className={`${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-50'} cursor-pointer transition`}
                                    >
                                        <td className="px-6 py-2 whitespace-nowrap">
                                            <div className="flex items-center gap-3">
                                                <button
                                                    onClick={(e) => handleToggleStar(e, client, false)}
                                                    className={`flex-shrink-0 w-5 h-5 flex items-center justify-center transition-colors ${isDark ? 'hover:text-yellow-400' : 'hover:text-yellow-600'}`}
                                                    title={client.isStarred ? 'Unstar this client' : 'Star this client'}
                                                >
                                                    <i className={`${client.isStarred ? 'fas' : 'far'} fa-star ${client.isStarred ? 'text-yellow-500' : isDark ? 'text-white' : 'text-gray-300'}`}></i>
                                                </button>
                                                {client.thumbnail ? (
                                                    <img src={client.thumbnail} alt={client.name} className="w-8 h-8 rounded-full object-cover border border-gray-200" />
                                                ) : (
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                                                        {(client.name || '?').charAt(0).toUpperCase()}
                                                    </div>
                                                )}
                                                <div className={`text-sm font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{client.name}</div>
                                            </div>
                                        </td>
                                        <td className={`px-6 py-2 whitespace-nowrap text-sm ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                                            {(() => {
                                                const groupNames = resolveGroupNames(client);
                                                return groupNames.length > 0
                                                    ? <span>{groupNames.join(', ')}</span>
                                                    : <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>None</span>;
                                            })()}
                                        </td>
                                        <td className={`px-6 py-2 whitespace-nowrap text-sm ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>{client.industry}</td>
                                        <td className="px-6 py-2 whitespace-nowrap">
                                            <div className="flex flex-wrap gap-1.5">
                                                {(() => {
                                                    const services = client.parsedServices || [];
                                                    const MAX = 3;
                                                    const visible = services.slice(0, MAX);
                                                    const remaining = services.length - visible.length;
                                                    
                                                    return (
                                                        <>
                                                            {visible.map((s, index) => (
                                                                <span key={getServiceKey(s, index)} className={`inline-flex items-center px-2 py-0.5 text-[10px] rounded ${isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700'}`}>
                                                                    <i className="fas fa-tag mr-1"></i>{getServiceString(s)}
                                                                </span>
                                                            ))}
                                                            {remaining > 0 && (
                                                                <span className={`inline-flex items-center px-2 py-0.5 text-[10px] rounded ${isDark ? 'bg-primary-900 text-primary-200' : 'bg-primary-100 text-primary-700'}`}>+{remaining}</span>
                                                            )}
                                                            {services.length === 0 && (
                                                                <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>None</span>
                                                            )}
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        </td>
                                        <td className="px-6 py-2 whitespace-nowrap">
                                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                                (client.status === 'Active' || client.status === 'active') ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                            }`}>
                                                {client.status === 'active' ? 'Active' : client.status}
                                            </span>
                                        </td>
                                    </tr>,
                                    ...siteRows.map((site, siteIdx) => (
                                        <tr
                                            key={`client-${client.id}-site-${site.id || siteIdx}`}
                                            onClick={() => handleOpenClientToSite(client, site)}
                                            className={`cursor-pointer ${isDark ? 'bg-gray-800/60 hover:bg-gray-800' : 'bg-gray-50/80 hover:bg-gray-100'}`}
                                        >
                                            <td className="px-6 py-1.5 text-sm" style={{ paddingLeft: '5.5rem' }}>
                                                <span className={`inline-flex items-center gap-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`} onClick={e => e.stopPropagation()}>
                                                    <i className="fas fa-map-marker-alt text-xs opacity-70 flex-shrink-0"></i>
                                                    <span>
                                                        {site.name || 'Unnamed site'}
                                                        {site.address ? <span className="text-xs opacity-80"> — {site.address}</span> : null}
                                                    </span>
                                                </span>
                                            </td>
                                            <td className={`px-6 py-1.5 whitespace-nowrap text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>—</td>
                                            <td className={`px-6 py-1.5 whitespace-nowrap text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{client.industry || '—'}</td>
                                            <td className={`px-6 py-1.5 whitespace-nowrap text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>—</td>
                                            <td className={`px-6 py-1.5 whitespace-nowrap text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>—</td>
                                        </tr>
                                    ))
                                ];
                            })
                        )}
                    </tbody>
                </table>
            </div>
            {/* Pagination Controls */}
            {sortedClients.length > 0 && (
                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-t px-6 py-4 flex items-center justify-between pr-32 flex-shrink-0`}>
                    <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        Showing {clientsStartIndex + 1} to {Math.min(clientsEndIndex, sortedClients.length)} of {sortedClients.length} clients
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setClientsPage(clientsPage - 1)}
                            disabled={clientsPage === 1}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isDark ? 'bg-gray-800 hover:bg-gray-750 border border-gray-700 text-gray-200' : 'bg-white hover:bg-gray-50 border border-gray-200 text-gray-700'} disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            <i className="fas fa-chevron-left mr-1"></i>
                            Previous
                        </button>
                        <span className={`px-4 py-2 text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            Page {clientsPage} of {totalClientsPages}
                        </span>
                        <button
                            onClick={() => setClientsPage(clientsPage + 1)}
                            disabled={clientsPage === totalClientsPages}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isDark ? 'bg-gray-800 hover:bg-gray-750 border border-gray-700 text-gray-200' : 'bg-white hover:bg-gray-50 border border-gray-200 text-gray-700'} disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            Next
                            <i className="fas fa-chevron-right ml-1"></i>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );

    // Group management handlers
    const [editingGroupId, setEditingGroupId] = useState(null);
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [groupFormData, setGroupFormData] = useState({ name: '', industry: 'Other', notes: '' });
    const isSavingGroupRef = useRef(false); // Prevent duplicate save requests

    const handleCreateGroup = () => {
        setGroupFormData({ name: '', industry: 'Other', notes: '' });
        setEditingGroupId(null);
        setShowGroupModal(true);
    };

    const handleEditGroup = (group) => {
        setGroupFormData({ 
            name: group.name || '', 
            industry: group.industry || 'Other', 
            notes: group.notes || '' 
        });
        setEditingGroupId(group.id);
        setShowGroupModal(true);
    };

    const handleSaveGroup = async () => {
        // Prevent duplicate requests
        if (isSavingGroupRef.current) {
            return; // Save already in progress, skip duplicate call
        }

        if (!groupFormData.name || !groupFormData.name.trim()) {
            alert('Please enter a group name');
            return;
        }

        isSavingGroupRef.current = true;

        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Authentication required');
                return;
            }

            const requestBody = {
                name: groupFormData.name.trim(),
                industry: groupFormData.industry,
                notes: groupFormData.notes || ''
            };

            if (editingGroupId) {
                // Update existing group - use client update API
                const response = await fetch(`/api/clients/${editingGroupId}`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify(requestBody)
                });

                if (response.ok) {
                    await loadGroups(true);
                    setShowGroupModal(false);
                    setEditingGroupId(null);
                } else {
                    const errorData = await response.json().catch(() => ({}));
                    const errorMessage = errorData?.error?.message || errorData?.error || 'Failed to update group';
                    alert(errorMessage);
                }
            } else {
                // Create new group
                const response = await fetch('/api/clients/groups', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify(requestBody)
                });

                if (response.ok) {
                    const responseData = await response.json().catch(() => ({}));
                    await loadGroups(true);
                    setShowGroupModal(false);
                    setGroupFormData({ name: '', industry: 'Other', notes: '' });
                } else {
                    const errorData = await response.json().catch(() => ({}));
                    const errorMessage = errorData?.error?.message || errorData?.error || 'Failed to create group';
                    const errorDetails = errorData?.error?.details || '';
                    alert(errorDetails ? `${errorMessage}\n\n${errorDetails}` : errorMessage);
                }
            }
        } catch (error) {
            alert('Error saving group: ' + error.message);
        } finally {
            isSavingGroupRef.current = false;
        }
    };

    const handleDeleteGroup = async (groupId) => {
        if (!confirm('Are you sure you want to delete this group? This will remove all client associations with this group.')) {
            return;
        }

        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Authentication required');
                return;
            }

            const response = await fetch(`/api/clients/groups/${groupId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });

            if (response.ok) {
                await loadGroups(true);
            } else {
                const errorData = await response.json().catch(() => ({}));
                alert(errorData?.error || 'Failed to delete group');
            }
        } catch (error) {
            console.error('Error deleting group:', error);
            alert('Error deleting group: ' + error.message);
        }
    };

    const GroupsListView = () => {
        const paginatedGroups = sortedGroups.slice(groupsStartIndex, groupsEndIndex);
        
        return (
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border flex flex-col h-full w-full`}>
                {/* Header with Add Group button */}
                <div className={`${isDark ? 'bg-gray-750 border-gray-700' : 'bg-gray-50 border-gray-200'} border-b px-6 py-4 flex items-center justify-between`}>
                    <h3 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Company Groups</h3>
                    <button
                        onClick={handleCreateGroup}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            isDark 
                                ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                    >
                        <i className="fas fa-plus mr-2"></i>
                        Add Group
                    </button>
                </div>

                {/* Group Modal */}
                {showGroupModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-xl p-6 w-full max-w-md`}>
                            <h3 className={`text-lg font-semibold mb-4 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                {editingGroupId ? 'Edit Group' : 'Create New Group'}
                            </h3>
                            <div className="space-y-4">
                                <div>
                                    <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                        Group Name *
                                    </label>
                                    <input
                                        type="text"
                                        value={groupFormData.name}
                                        onChange={(e) => setGroupFormData({ ...groupFormData, name: e.target.value })}
                                        className={`w-full px-3 py-2 rounded-md border ${
                                            isDark 
                                                ? 'bg-gray-700 border-gray-600 text-gray-100' 
                                                : 'bg-white border-gray-300 text-gray-900'
                                        }`}
                                        placeholder="Enter group name"
                                        autoFocus
                                    />
                                </div>
                                <div>
                                    <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                        Industry
                                    </label>
                                    <select
                                        value={groupFormData.industry}
                                        onChange={(e) => setGroupFormData({ ...groupFormData, industry: e.target.value })}
                                        className={`w-full px-3 py-2 rounded-md border ${
                                            isDark 
                                                ? 'bg-gray-700 border-gray-600 text-gray-100' 
                                                : 'bg-white border-gray-300 text-gray-900'
                                        }`}
                                    >
                                        {industries.length > 0 ? (
                                            industries.map(ind => (
                                                <option key={ind.id || ind.name} value={ind.name}>{ind.name}</option>
                                            ))
                                        ) : (
                                            <option value="Other">Other</option>
                                        )}
                                    </select>
                                </div>
                                <div>
                                    <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                        Notes
                                    </label>
                                    <textarea
                                        value={groupFormData.notes}
                                        onChange={(e) => setGroupFormData({ ...groupFormData, notes: e.target.value })}
                                        rows={3}
                                        className={`w-full px-3 py-2 rounded-md border ${
                                            isDark 
                                                ? 'bg-gray-700 border-gray-600 text-gray-100' 
                                                : 'bg-white border-gray-300 text-gray-900'
                                        }`}
                                        placeholder="Optional notes about this group"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 mt-6">
                                <button
                                    onClick={() => {
                                        setShowGroupModal(false);
                                        setEditingGroupId(null);
                                        setGroupFormData({ name: '', industry: 'Other', notes: '' });
                                    }}
                                    className={`px-4 py-2 rounded-md text-sm font-medium ${
                                        isDark 
                                            ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' 
                                            : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                                    }`}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveGroup}
                                    className="px-4 py-2 rounded-md text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white"
                                >
                                    {editingGroupId ? 'Update' : 'Create'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-auto -mx-3 sm:mx-0 px-3 sm:px-0 w-full" style={{ WebkitOverflowScrolling: 'touch' }}>
                    {isLoadingGroups ? (
                        <div className="flex items-center justify-center py-12">
                            <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                <i className="fas fa-spinner fa-spin mr-2"></i>
                                Loading groups...
                            </div>
                        </div>
                    ) : (
                        <table className={`w-full divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-200'}`} style={{ minWidth: '640px', width: '100%' }}>
                            <thead className={isDark ? 'bg-gray-800' : 'bg-gray-50'}>
                                <tr>
                                    <th 
                                        className={`px-6 py-2 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider cursor-pointer`}
                                        onClick={() => {
                                            if (sortField === 'name') {
                                                setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                                            } else {
                                                setSortField('name');
                                                setSortDirection('asc');
                                            }
                                        }}
                                    >
                                        <div className="flex items-center">
                                            Group Name
                                            {sortField === 'name' && (
                                                <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ml-1 text-xs`}></i>
                                            )}
                                        </div>
                                    </th>
                                    <th 
                                        className={`px-6 py-2 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider cursor-pointer`}
                                        onClick={() => {
                                            if (sortField === 'industry') {
                                                setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                                            } else {
                                                setSortField('industry');
                                                setSortDirection('asc');
                                            }
                                        }}
                                    >
                                        <div className="flex items-center">
                                            Industry
                                            {sortField === 'industry' && (
                                                <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ml-1 text-xs`}></i>
                                            )}
                                        </div>
                                    </th>
                                    <th 
                                        className={`px-6 py-2 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider cursor-pointer`}
                                        onClick={() => {
                                            if (sortField === 'members') {
                                                setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                                            } else {
                                                setSortField('members');
                                                setSortDirection('asc');
                                            }
                                        }}
                                    >
                                        <div className="flex items-center">
                                            Members
                                            {sortField === 'members' && (
                                                <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ml-1 text-xs`}></i>
                                            )}
                                        </div>
                                    </th>
                                    <th className={`px-6 py-2 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider`}>
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className={`${isDark ? 'bg-gray-900 divide-gray-800' : 'bg-white divide-gray-100'} divide-y`}>
                                {paginatedGroups.length === 0 ? (
                                    <tr>
                                        <td colSpan="4" className={`px-6 py-8 text-center text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                            <i className={`fas fa-inbox text-3xl ${isDark ? 'text-gray-600' : 'text-gray-300'} mb-2`}></i>
                                            <p>No groups found</p>
                                            <button
                                                onClick={handleCreateGroup}
                                                className={`mt-4 px-4 py-2 rounded-lg text-sm font-medium ${
                                                    isDark 
                                                        ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                                                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                                                }`}
                                            >
                                                <i className="fas fa-plus mr-2"></i>
                                                Create Your First Group
                                            </button>
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedGroups.map(group => {
                                        const memberCount = (group._count?.childCompanies || 0) + (group._count?.groupChildren || 0);
                                        return (
                                            <tr 
                                                key={group.id}
                                                onClick={() => {
                                                    setSelectedGroup(group);
                                                    loadGroupMembers(group.id);
                                                }}
                                                className={`${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'} transition cursor-pointer`}
                                            >
                                                <td className="px-6 py-2 whitespace-nowrap">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${isDark ? 'bg-blue-700 text-blue-200' : 'bg-blue-100 text-blue-700'}`}>
                                                            <i className="fas fa-layer-group"></i>
                                                        </div>
                                                        <div className={`text-sm font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{group.name}</div>
                                                    </div>
                                                </td>
                                                <td className={`px-6 py-2 whitespace-nowrap text-sm ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                                                    {group.industry || 'Other'}
                                                </td>
                                                <td className={`px-6 py-2 whitespace-nowrap text-sm ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                                        isDark 
                                                            ? 'bg-blue-900 text-blue-200' 
                                                            : 'bg-blue-100 text-blue-800'
                                                    }`}>
                                                        {memberCount} {memberCount === 1 ? 'member' : 'members'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-2 whitespace-nowrap">
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleEditGroup(group);
                                                            }}
                                                            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                                                                isDark 
                                                                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' 
                                                                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                                                            }`}
                                                            title="Edit group"
                                                        >
                                                            <i className="fas fa-edit"></i>
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDeleteGroup(group.id);
                                                            }}
                                                            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                                                                isDark 
                                                                    ? 'bg-red-900 hover:bg-red-800 text-red-200' 
                                                                    : 'bg-red-100 hover:bg-red-200 text-red-700'
                                                            }`}
                                                            title="Delete group"
                                                        >
                                                            <i className="fas fa-trash"></i>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
                {/* Pagination Controls */}
                {sortedGroups.length > 0 && (
                    <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-t px-6 py-4 flex items-center justify-between pr-32 flex-shrink-0`}>
                        <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            Showing {groupsStartIndex + 1} to {Math.min(groupsEndIndex, sortedGroups.length)} of {sortedGroups.length} groups
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setGroupsPage(groupsPage - 1)}
                                disabled={groupsPage === 1}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isDark ? 'bg-gray-800 hover:bg-gray-750 border border-gray-700 text-gray-200' : 'bg-white hover:bg-gray-50 border border-gray-200 text-gray-700'} disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                <i className="fas fa-chevron-left mr-1"></i>
                                Previous
                            </button>
                            <span className={`px-4 py-2 text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                Page {groupsPage} of {totalGroupsPages}
                            </span>
                            <button
                                onClick={() => setGroupsPage(groupsPage + 1)}
                                disabled={groupsPage === totalGroupsPages}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isDark ? 'bg-gray-800 hover:bg-gray-750 border border-gray-700 text-gray-200' : 'bg-white hover:bg-gray-50 border border-gray-200 text-gray-700'} disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                Next
                                <i className="fas fa-chevron-right ml-1"></i>
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // Group Detail View - Shows all clients and leads in a group
    const GroupDetailView = ({ group, members, isLoading, error, onBack, onClientClick, onLeadClick, onRefreshMembers }) => {
        const [showAddMemberModal, setShowAddMemberModal] = useState(false);
        
        // Debug log to verify component is rendering
        useEffect(() => {
            console.log('✅ GroupDetailView rendered for group:', group?.name);
        }, [group]);
        const [searchTerm, setSearchTerm] = useState('');
        const [selectedType, setSelectedType] = useState('all'); // 'all', 'client', 'lead'
        const [availableItems, setAvailableItems] = useState([]);
        const [isLoadingItems, setIsLoadingItems] = useState(false);
        const [selectedItems, setSelectedItems] = useState(new Set());
        const [isAdding, setIsAdding] = useState(false);
        
        // Debug: Log members structure
        useEffect(() => {
            console.log('🔍 GroupDetailView - members received:', {
                totalMembers: members.length,
                members: members,
                memberTypes: members.map(m => ({ id: m.id, name: m.name, type: m.type }))
            });
        }, [members]);
        
        // Filter members - be more lenient with type checking
        const groupClients = members.filter(m => {
            const type = m?.type;
            // Include if type is 'client', null, undefined, empty string, or not 'lead'
            return type === 'client' || !type || type === '' || (type !== 'lead' && type !== 'group');
        });
        const groupLeads = members.filter(m => m?.type === 'lead');
        
        // Debug: Log filtered results
        useEffect(() => {
            console.log('🔍 GroupDetailView - filtered members:', {
                totalMembers: members.length,
                groupClients: groupClients.length,
                groupLeads: groupLeads.length,
                groupClientsData: groupClients,
                groupLeadsData: groupLeads
            });
        }, [members, groupClients, groupLeads]);
        
        // Get member IDs to exclude from selection
        const memberIds = useMemo(() => new Set(members.map(m => m.id)), [members]);
        
        // Load available clients and leads when modal opens
        useEffect(() => {
            if (showAddMemberModal) {
                loadAvailableItems();
            }
        }, [showAddMemberModal]);
        
        const loadAvailableItems = async () => {
            setIsLoadingItems(true);
            try {
                const token = window.storage?.getToken?.();
                if (!token) {
                    console.warn('⚠️ No token available');
                    setAvailableItems([]);
                    setIsLoadingItems(false);
                    return;
                }
                
                // Fetch all clients and leads (API returns both)
                const response = await fetch('/api/clients', {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include'
                });
                
                if (!response.ok) {
                    const errorText = await response.text().catch(() => 'Unknown error');
                    console.error(`❌ Failed to fetch clients and leads: ${response.status} ${response.statusText}`, errorText);
                    
                    // Show user-friendly error message
                    if (response.status === 500) {
                        console.warn('⚠️ Server error - this may be a temporary issue. Please try again later.');
                    }
                    
                    setAvailableItems([]);
                    setIsLoadingItems(false);
                    return;
                }
                
                const data = await response.json();
                const allItems = data?.data?.clients || data?.clients || [];
                
                if (!Array.isArray(allItems)) {
                    console.warn('⚠️ API returned invalid data format');
                    setAvailableItems([]);
                    setIsLoadingItems(false);
                    return;
                }
                
                // Filter out items that are already members, groups, and the current group itself
                const filtered = allItems.filter(item => {
                    // Exclude if already a member
                    if (memberIds.has(item.id)) return false;
                    // Exclude if it's the group itself
                    if (item.id === group.id) return false;
                    // Exclude other groups (only include actual clients and leads)
                    if (item.type === 'group') return false;
                    // Only include clients and leads
                    return item.type === 'client' || item.type === 'lead' || !item.type;
                });
                
                setAvailableItems(filtered);
            } catch (error) {
                console.error('❌ Error loading available items:', error);
                setAvailableItems([]);
            } finally {
                setIsLoadingItems(false);
            }
        };
        
        const filteredItems = useMemo(() => {
            let filtered = availableItems;
            
            // Filter by type
            if (selectedType === 'client') {
                filtered = filtered.filter(item => item.type === 'client' || !item.type);
            } else if (selectedType === 'lead') {
                filtered = filtered.filter(item => item.type === 'lead');
            }
            
            // Filter by search term
            if (searchTerm.trim()) {
                const searchLower = searchTerm.toLowerCase();
                filtered = filtered.filter(item => 
                    item.name?.toLowerCase().includes(searchLower) ||
                    item.industry?.toLowerCase().includes(searchLower)
                );
            }
            
            return filtered;
        }, [availableItems, selectedType, searchTerm]);
        
        const handleToggleSelection = (itemId) => {
            setSelectedItems(prev => {
                const newSet = new Set(prev);
                if (newSet.has(itemId)) {
                    newSet.delete(itemId);
                } else {
                    newSet.add(itemId);
                }
                return newSet;
            });
        };
        
        const handleAddSelected = async () => {
            if (selectedItems.size === 0) {
                alert('Please select at least one client or lead to add');
                return;
            }
            
            setIsAdding(true);
            try {
                const token = window.storage?.getToken?.();
                if (!token) {
                    alert('Authentication required');
                    return;
                }
                
                const addPromises = Array.from(selectedItems).map(async (itemId) => {
                    try {
                        const response = await fetch(`/api/clients/${itemId}/groups`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            },
                            credentials: 'include',
                            body: JSON.stringify({ groupId: group.id, role: 'member' })
                        });
                        
                        if (!response.ok) {
                            const errorData = await response.json().catch(() => ({}));
                            const errorMessage = errorData.error || errorData.error?.message || `Failed to add item ${itemId}`;
                            
                            // For 500 errors, log but don't throw - allow other items to be added
                            if (response.status === 500) {
                                console.warn(`⚠️ Server error adding item ${itemId} to group. Skipping this item.`);
                                return null; // Return null to indicate failure but don't break the batch
                            }
                            
                            throw new Error(errorMessage);
                        }
                        
                        return response.json();
                    } catch (error) {
                        // For server errors, return null instead of throwing
                        if (error.message.includes('500') || error.message.includes('Internal Server Error')) {
                            console.warn(`⚠️ Server error adding item ${itemId} to group:`, error.message);
                            return null;
                        }
                        throw error;
                    }
                });
                
                const results = await Promise.allSettled(addPromises);
                
                // Count successes and failures
                const successful = results.filter(r => r.status === 'fulfilled' && r.value !== null).length;
                const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value === null)).length;
                
                // Refresh group members
                if (onRefreshMembers) {
                    onRefreshMembers();
                }
                
                // Close modal and reset
                setShowAddMemberModal(false);
                setSelectedItems(new Set());
                setSearchTerm('');
                setSelectedType('all');
                
                // Show summary message
                if (failed > 0) {
                    if (successful > 0) {
                        alert(`⚠️ Added ${successful} member(s) successfully. ${failed} member(s) failed due to server errors.`);
                    } else {
                        alert('❌ Failed to add members. This may be due to database issues with some clients. Please contact support if this persists.');
                    }
                } else if (successful > 0) {
                    alert(`✅ Successfully added ${successful} member(s) to the group.`);
                }
            } catch (error) {
                console.error('❌ Error adding members:', error);
                alert('❌ Failed to add members: ' + (error.message || 'Unknown error'));
            } finally {
                setIsAdding(false);
            }
        };
        
        return (
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border flex flex-col h-full w-full`}>
                {/* Header with Back button */}
                <div className={`${isDark ? 'bg-gray-750 border-gray-700' : 'bg-gray-50 border-gray-200'} border-b px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4`}>
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                        <button
                            onClick={onBack}
                            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex-shrink-0 ${
                                isDark 
                                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' 
                                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                            }`}
                        >
                            <i className="fas fa-arrow-left mr-2"></i>
                            <span className="hidden sm:inline">Back to Groups</span>
                            <span className="sm:hidden">Back</span>
                        </button>
                        <div className="min-w-0 flex-1">
                            <h3 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'} truncate`}>
                                {group.name}
                            </h3>
                            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                {members.length} {members.length === 1 ? 'member' : 'members'} 
                                {groupClients.length > 0 && ` • ${groupClients.length} client${groupClients.length === 1 ? '' : 's'}`}
                                {groupLeads.length > 0 && ` • ${groupLeads.length} lead${groupLeads.length === 1 ? '' : 's'}`}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            console.log('✅ Add Member button clicked for group:', group?.name);
                            setShowAddMemberModal(true);
                        }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-shrink-0 whitespace-nowrap shadow-md ${
                            isDark 
                                ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                        title="Add clients or leads to this group"
                    >
                        <i className="fas fa-plus mr-2"></i>
                        Add Member
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto -mx-3 sm:mx-0 px-3 sm:px-0 w-full" style={{ WebkitOverflowScrolling: 'touch' }}>
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                <i className="fas fa-spinner fa-spin mr-2"></i>
                                Loading group members...
                            </div>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center py-12 px-4">
                            <i className={`fas fa-exclamation-triangle text-4xl ${isDark ? 'text-yellow-500' : 'text-yellow-600'} mb-4`}></i>
                            <p className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2 text-center`}>
                                {error.message}
                            </p>
                            {error.type === 'rate_limit' && (
                                <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'} mb-4 text-center`}>
                                    The server is temporarily limiting requests. Please wait before retrying.
                                </p>
                            )}
                            <button
                                onClick={() => {
                                    if (onRefreshMembers) {
                                        onRefreshMembers();
                                    }
                                }}
                                disabled={error.type === 'rate_limit' && window.RateLimitManager?.isRateLimited()}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    error.type === 'rate_limit' && window.RateLimitManager?.isRateLimited()
                                        ? `${isDark ? 'bg-gray-700 text-gray-500' : 'bg-gray-200 text-gray-400'} cursor-not-allowed`
                                        : `${isDark ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`
                                }`}
                            >
                                <i className="fas fa-redo mr-2"></i>
                                Retry
                            </button>
                        </div>
                    ) : members.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12">
                            <i className={`fas fa-inbox text-4xl ${isDark ? 'text-gray-600' : 'text-gray-300'} mb-4`}></i>
                            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                No members in this group
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-6 py-4">
                            {/* Debug: Show all members if filtered arrays are empty but members exist */}
                            {members.length > 0 && groupClients.length === 0 && groupLeads.length === 0 && (
                                <div className={`${isDark ? 'bg-yellow-900 border-yellow-700' : 'bg-yellow-50 border-yellow-200'} border rounded-lg p-4 mb-4`}>
                                    <p className={`text-sm ${isDark ? 'text-yellow-200' : 'text-yellow-800'}`}>
                                        <i className="fas fa-info-circle mr-2"></i>
                                        Found {members.length} member(s) but they couldn't be categorized. Showing all members:
                                    </p>
                                </div>
                            )}
                            
                            {/* Clients Section */}
                            {groupClients.length > 0 && (
                                <div>
                                    <h4 className={`text-md font-semibold mb-3 px-6 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                                        <i className="fas fa-building mr-2"></i>
                                        Clients ({groupClients.length})
                                    </h4>
                                    <div className="space-y-2">
                                        {groupClients.map(client => (
                                            <div
                                                key={client.id}
                                                onClick={() => onClientClick(client)}
                                                className={`${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-50 hover:bg-gray-100'} rounded-lg p-4 cursor-pointer transition`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${
                                                            isDark ? 'bg-blue-700 text-blue-200' : 'bg-blue-100 text-blue-700'
                                                        }`}>
                                                            {client.name.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                                {client.name}
                                                            </div>
                                                            <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                                {(() => {
                                                                    // Parse sites from JSON string or use array directly
                                                                    let sites = [];
                                                                    if (client.sites) {
                                                                        if (typeof client.sites === 'string') {
                                                                            try {
                                                                                sites = JSON.parse(client.sites);
                                                                            } catch (e) {
                                                                                sites = [];
                                                                            }
                                                                        } else if (Array.isArray(client.sites)) {
                                                                            sites = client.sites;
                                                                        }
                                                                    }
                                                                    
                                                                    if (sites.length > 0) {
                                                                        // Handle both string sites and object sites
                                                                        const siteNames = sites
                                                                            .filter(site => site) // Filter out null/undefined
                                                                            .map(site => {
                                                                                // If site is a string, use it directly
                                                                                if (typeof site === 'string') {
                                                                                    return site;
                                                                                }
                                                                                // If site is an object with a name property, use it
                                                                                if (site && typeof site === 'object' && site.name) {
                                                                                    return site.name;
                                                                                }
                                                                                // If site is an object with other properties, try to find a name-like field
                                                                                if (site && typeof site === 'object') {
                                                                                    return site.name || site.location || site.address || JSON.stringify(site);
                                                                                }
                                                                                return null;
                                                                            })
                                                                            .filter(name => name) // Remove null/undefined names
                                                                            .slice(0, 3); // Limit to 3 sites
                                                                        
                                                                        if (siteNames.length > 0) {
                                                                            return `Sites: ${siteNames.join(', ')}${sites.length > 3 ? '...' : ''}`;
                                                                        }
                                                                    }
                                                                    return 'Sites: None';
                                                                })()}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        {client.revenue && (
                                                            <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                                R{client.revenue.toLocaleString()}
                                                            </span>
                                                        )}
                                                        <i className={`fas fa-chevron-right ${isDark ? 'text-gray-400' : 'text-gray-500'}`}></i>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Fallback: Show all members if filtering resulted in empty arrays */}
                            {members.length > 0 && groupClients.length === 0 && groupLeads.length === 0 && (
                                <div>
                                    <h4 className={`text-md font-semibold mb-3 px-6 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                                        <i className="fas fa-users mr-2"></i>
                                        Members ({members.length})
                                    </h4>
                                    <div className="space-y-2">
                                        {members.map(member => (
                                            <div
                                                key={member.id}
                                                onClick={() => {
                                                    if (member.type === 'lead') {
                                                        onLeadClick(member);
                                                    } else {
                                                        onClientClick(member);
                                                    }
                                                }}
                                                className={`${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-50 hover:bg-gray-100'} rounded-lg p-4 cursor-pointer transition`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${
                                                            isDark ? 'bg-blue-700 text-blue-200' : 'bg-blue-100 text-blue-700'
                                                        }`}>
                                                            {member.name?.charAt(0)?.toUpperCase() || '?'}
                                                        </div>
                                                        <div>
                                                            <div className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                                {member.name || 'Unnamed'}
                                                            </div>
                                                            <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                                Type: {member.type || 'not set'} • ID: {member.id}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <i className={`fas fa-chevron-right ${isDark ? 'text-gray-400' : 'text-gray-500'}`}></i>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            
                            {/* Leads Section */}
                            {groupLeads.length > 0 && (
                                <div>
                                    <h4 className={`text-md font-semibold mb-3 px-6 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                                        <i className="fas fa-user-tie mr-2"></i>
                                        Leads ({groupLeads.length})
                                    </h4>
                                    <div className="space-y-2">
                                        {groupLeads.map(lead => (
                                            <div
                                                key={lead.id}
                                                onClick={() => onLeadClick(lead)}
                                                className={`${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-50 hover:bg-gray-100'} rounded-lg p-4 cursor-pointer transition`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${
                                                            isDark ? 'bg-yellow-700 text-yellow-200' : 'bg-yellow-100 text-yellow-700'
                                                        }`}>
                                                            {lead.name.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                                {lead.name}
                                                            </div>
                                                            <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                                {(() => {
                                                                    const parts = [];
                                                                    if (lead.industry && lead.industry !== 'Other') {
                                                                        parts.push(lead.industry);
                                                                    }
                                                                    
                                                                    // Parse sites once - always return array, never undefined/null
                                                                    let sites = [];
                                                                    if (lead.sites) {
                                                                        if (Array.isArray(lead.sites)) {
                                                                            sites = lead.sites;
                                                                        } else if (typeof lead.sites === 'string') {
                                                                            try {
                                                                                const parsed = JSON.parse(lead.sites || '[]');
                                                                                sites = Array.isArray(parsed) ? parsed : [];
                                                                            } catch {
                                                                                sites = [];
                                                                            }
                                                                        }
                                                                    }
                                                                    
                                                                    if (sites.length > 0) {
                                                                        // Show each site with Stage and/or AIDA when present (per-site lead tracking)
                                                                        const siteLabels = sites
                                                                            .filter(site => site)
                                                                            .slice(0, 4)
                                                                            .map(site => {
                                                                                const name = typeof site === 'string'
                                                                                    ? site
                                                                                    : (site?.name || site?.location || site?.address || '');
                                                                                const stage = site && typeof site === 'object' ? (site.stage || '') : '';
                                                                                const aida = site && typeof site === 'object' ? (site.aidaStatus || '') : '';
                                                                                const label = [stage, aida].filter(Boolean).join(' · ');
                                                                                return label ? `${name} (${label})` : name;
                                                                            })
                                                                            .filter(Boolean);
                                                                        if (siteLabels.length > 0) {
                                                                            parts.push(`Sites: ${siteLabels.join(', ')}${sites.length > 4 ? '…' : ''}`);
                                                                        }
                                                                    }
                                                                    
                                                                    // Fallback if no parts (don't show status)
                                                                    if (parts.length === 0) {
                                                                        return lead.industry || 'Other';
                                                                    }
                                                                    
                                                                    return parts.join(' • ');
                                                                })()}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        {lead.value && (
                                                            <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                                R{lead.value.toLocaleString()}
                                                            </span>
                                                        )}
                                                        <i className={`fas fa-chevron-right ${isDark ? 'text-gray-400' : 'text-gray-500'}`}></i>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                
                {/* Add Member Modal */}
                {showAddMemberModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-xl border max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col`}>
                            {/* Modal Header */}
                            <div className={`${isDark ? 'bg-gray-750 border-gray-700' : 'bg-gray-50 border-gray-200'} border-b px-6 py-4 flex items-center justify-between`}>
                                <h3 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                    Add Members to {group.name}
                                </h3>
                                <button
                                    onClick={() => {
                                        setShowAddMemberModal(false);
                                        setSelectedItems(new Set());
                                        setSearchTerm('');
                                        setSelectedType('all');
                                    }}
                                    className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                                        isDark 
                                            ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' 
                                            : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                                    }`}
                                >
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                            
                            {/* Modal Content */}
                            <div className="flex-1 overflow-hidden flex flex-col p-6">
                                {/* Search and Filter */}
                                <div className="space-y-4 mb-4">
                                    <div className="flex gap-3">
                                        <div className="flex-1">
                                            <input
                                                type="text"
                                                placeholder="Search by name or industry..."
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                className={`w-full px-4 py-2 rounded-lg border ${
                                                    isDark 
                                                        ? 'bg-gray-700 border-gray-600 text-gray-100' 
                                                        : 'bg-white border-gray-300 text-gray-900'
                                                } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                                            />
                                        </div>
                                        <select
                                            value={selectedType}
                                            onChange={(e) => setSelectedType(e.target.value)}
                                            className={`px-4 py-2 rounded-lg border ${
                                                isDark 
                                                    ? 'bg-gray-700 border-gray-600 text-gray-100' 
                                                    : 'bg-white border-gray-300 text-gray-900'
                                            } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                                        >
                                            <option value="all">All Types</option>
                                            <option value="client">Clients Only</option>
                                            <option value="lead">Leads Only</option>
                                        </select>
                                    </div>
                                    {selectedItems.size > 0 && (
                                        <div className={`px-3 py-2 rounded-lg ${
                                            isDark ? 'bg-blue-900 text-blue-200' : 'bg-blue-50 text-blue-800'
                                        }`}>
                                            <span className="text-sm font-medium">
                                                {selectedItems.size} {selectedItems.size === 1 ? 'item' : 'items'} selected
                                            </span>
                                        </div>
                                    )}
                                </div>
                                
                                {/* Items List */}
                                <div className="flex-1 overflow-y-auto border rounded-lg">
                                    {isLoadingItems ? (
                                        <div className="flex items-center justify-center py-12">
                                            <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                <i className="fas fa-spinner fa-spin mr-2"></i>
                                                Loading...
                                            </div>
                                        </div>
                                    ) : filteredItems.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-12">
                                            <i className={`fas fa-inbox text-4xl ${isDark ? 'text-gray-600' : 'text-gray-300'} mb-4`}></i>
                                            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                {searchTerm || selectedType !== 'all' 
                                                    ? 'No matching clients or leads found' 
                                                    : 'No available clients or leads to add'}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="divide-y">
                                            {filteredItems.map(item => {
                                                const isSelected = selectedItems.has(item.id);
                                                const isClient = item.type === 'client' || !item.type;
                                                
                                                return (
                                                    <div
                                                        key={item.id}
                                                        onClick={() => handleToggleSelection(item.id)}
                                                        className={`p-4 cursor-pointer transition ${
                                                            isSelected
                                                                ? isDark ? 'bg-blue-900' : 'bg-blue-50'
                                                                : isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <input
                                                                type="checkbox"
                                                                checked={isSelected}
                                                                onChange={() => handleToggleSelection(item.id)}
                                                                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                                                                onClick={(e) => e.stopPropagation()}
                                                            />
                                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${
                                                                isClient
                                                                    ? isDark ? 'bg-blue-700 text-blue-200' : 'bg-blue-100 text-blue-700'
                                                                    : isDark ? 'bg-yellow-700 text-yellow-200' : 'bg-yellow-100 text-yellow-700'
                                                            }`}>
                                                                {item.name?.charAt(0)?.toUpperCase() || '?'}
                                                            </div>
                                                            <div className="flex-1">
                                                                <div className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                                    {item.name}
                                                                    {isClient ? (
                                                                        <span className={`ml-2 px-2 py-0.5 text-xs rounded ${
                                                                            isDark ? 'bg-blue-900 text-blue-200' : 'bg-blue-100 text-blue-700'
                                                                        }`}>
                                                                            Client
                                                                        </span>
                                                                    ) : (
                                                                        <span className={`ml-2 px-2 py-0.5 text-xs rounded ${
                                                                            isDark ? 'bg-yellow-900 text-yellow-200' : 'bg-yellow-100 text-yellow-700'
                                                                        }`}>
                                                                            Lead
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                                    {item.industry || 'Other'} • {item.status || 'Active'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            {/* Modal Footer */}
                            <div className={`${isDark ? 'bg-gray-750 border-gray-700' : 'bg-gray-50 border-gray-200'} border-t px-6 py-4 flex items-center justify-end gap-3`}>
                                <button
                                    onClick={() => {
                                        setShowAddMemberModal(false);
                                        setSelectedItems(new Set());
                                        setSearchTerm('');
                                        setSelectedType('all');
                                    }}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                        isDark 
                                            ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' 
                                            : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                                    }`}
                                    disabled={isAdding}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAddSelected}
                                    disabled={selectedItems.size === 0 || isAdding}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                        isDark 
                                            ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                                >
                                    {isAdding ? (
                                        <>
                                            <i className="fas fa-spinner fa-spin mr-2"></i>
                                            Adding...
                                        </>
                                    ) : (
                                        <>
                                            <i className="fas fa-plus mr-2"></i>
                                            Add Selected ({selectedItems.size})
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const PipelineView = React.memo(({
        items,
        isDark,
        typeFilter,
        onTypeFilterChange,
        stages,
        isLoading,
        onOpenLead,
        onOpenOpportunity
    }) => {
        const [searchTerm, setSearchTerm] = useState('');
        const [showLoadingIndicator, setShowLoadingIndicator] = useState(false);

        useEffect(() => {
            let timeoutId = null;

            if (isLoading) {
                timeoutId = setTimeout(() => {
                    setShowLoadingIndicator(true);
                }, 250);
            } else {
                setShowLoadingIndicator(false);
            }

            return () => {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
            };
        }, [isLoading]);

        const stageOrder = useMemo(() => {
            const order = {};
            stages.forEach((stage, index) => {
                order[stage] = index;
            });
            return order;
        }, [stages]);

        const normalizedSearch = searchTerm.trim().toLowerCase();

        const filteredItems = useMemo(() => {
            if (!Array.isArray(items) || items.length === 0) {
                return [];
            }

            return items.filter((item) => {
                if (typeFilter === 'leads' && item.type !== 'lead') {
                    return false;
                }

                if (typeFilter === 'opportunities' && item.type !== 'opportunity') {
                    return false;
                }

                if (!normalizedSearch) {
                    return true;
                }

                const haystack = [
                    item.name,
                    item.organization,
                    item.stage,
                    item.owner
                ]
                    .filter(Boolean)
                    .map((value) => value.toString().toLowerCase());

                return haystack.some((value) => value.includes(normalizedSearch));
            });
        }, [items, typeFilter, normalizedSearch]);

        const sortedItems = useMemo(() => {
            if (filteredItems.length === 0) {
                return [];
            }

            return [...filteredItems].sort((a, b) => {
                const stageComparison = (stageOrder[a.stage] ?? 0) - (stageOrder[b.stage] ?? 0);
                if (stageComparison !== 0) {
                    return stageComparison;
                }

                if (a.updatedAt && b.updatedAt) {
                    return b.updatedAt - a.updatedAt;
                }

                return (a.name || '').toString().localeCompare((b.name || '').toString());
            });
        }, [filteredItems, stageOrder]);

        const groupedByStage = useMemo(() => {
            const groups = {};
            stages.forEach((stage) => {
                groups[stage] = [];
            });

            sortedItems.forEach((item) => {
                const stage = stages.includes(item.stage) ? item.stage : stages[0];
                groups[stage].push(item);
            });

            return groups;
        }, [sortedItems, stages]);

        const totals = useMemo(() => ({
            total: filteredItems.length,
            leads: filteredItems.filter((item) => item.type === 'lead').length,
            opportunities: filteredItems.filter((item) => item.type === 'opportunity').length,
            value: filteredItems.reduce((sum, item) => sum + (item.value || 0), 0)
        }), [filteredItems]);

        const stageSummaries = useMemo(() => (
            stages.map((stage) => {
                const stageItems = groupedByStage[stage] || [];
                const stageValue = stageItems.reduce((sum, item) => sum + (item.value || 0), 0);
                return {
                    stage,
                    count: stageItems.length,
                    value: stageValue
                };
            })
        ), [groupedByStage, stages]);

        const formatCurrency = (amount) => `R ${(amount || 0).toLocaleString('en-ZA')}`;

        const getStageBadgeClasses = (stage) => {
            const lightMap = {
                'No Engagement': 'bg-slate-100 text-slate-800',
                Awareness: 'bg-gray-100 text-gray-800',
                Interest: 'bg-blue-100 text-blue-800',
                Desire: 'bg-yellow-100 text-yellow-800',
                Action: 'bg-green-100 text-green-800'
            };
            const darkMap = {
                'No Engagement': 'bg-slate-700 text-slate-200',
                Awareness: 'bg-gray-700 text-gray-200',
                Interest: 'bg-blue-900 text-blue-200',
                Desire: 'bg-yellow-900 text-yellow-200',
                Action: 'bg-green-900 text-green-200'
            };
            return (isDark ? darkMap : lightMap)[stage] || (isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-800');
        };

        const typeBadgeClasses = (type) => {
            if (type === 'lead') {
                return isDark ? 'bg-purple-900 text-purple-200' : 'bg-purple-100 text-purple-700';
            }
            return isDark ? 'bg-teal-900 text-teal-200' : 'bg-teal-100 text-teal-700';
        };

        const handleItemOpen = (item) => {
            if (!item) {
                return;
            }

            if (item.type === 'lead') {
                onOpenLead?.({
                    leadId: item.raw?.id,
                    leadData: item.raw
                });
                return;
            }

            if (item.type === 'opportunity') {
                onOpenOpportunity?.({
                    opportunityId: item.raw?.id,
                    clientId: item.clientId,
                    clientName: item.clientName,
                    opportunity: item.raw
                });
            }
        };

        const renderListView = () => (
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border shadow-sm`}>
                <div className="overflow-x-auto">
                    <table className={`min-w-full divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-200'}`}>
                        <thead className={isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-50 text-gray-500'}>
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide">Name</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide">Type</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide">Value</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide">Organisation</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide">Owner</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide">Updated</th>
                            </tr>
                        </thead>
                        <tbody className={`${isDark ? 'bg-gray-900 divide-gray-800' : 'bg-white divide-gray-100'} divide-y`}>
                            {sortedItems.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="px-6 py-16 text-center">
                                        <div className={`mx-auto w-14 h-14 rounded-full flex items-center justify-center ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-500'}`}>
                                            <i className="fas fa-stream text-xl"></i>
                                        </div>
                                        <p className={`mt-4 text-base font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>No pipeline items to show</p>
                                        <p className={`mt-2 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Adjust the filters or add new leads and opportunities.</p>
                                    </td>
                                </tr>
                            ) : (
                                sortedItems.map((item) => (
                                    <tr
                                        key={item.key}
                                        onClick={() => handleItemOpen(item)}
                                        className={`${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-50'} cursor-pointer transition`}
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{item.name}</span>
                                                <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                    {item.type === 'opportunity' ? item.clientName || 'Opportunity' : 'Lead'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${typeBadgeClasses(item.type)}`}>
                                                {item.type === 'lead' ? 'Lead' : 'Opportunity'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                {formatCurrency(item.value)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>{item.organization}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>{item.owner || 'Unassigned'}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>
                                                {new Date(item.updatedAt || Date.now()).toLocaleDateString('en-ZA')}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );


        return (
            <div className="space-y-6">
                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-xl border shadow-sm p-4 flex flex-wrap gap-3 items-center justify-between`}>
                    <div className="flex items-center flex-wrap gap-2">
                        <div className="inline-flex rounded-lg border overflow-hidden">
                            <button
                                type="button"
                                onClick={() => onTypeFilterChange('all')}
                                className={`px-3 py-1.5 text-sm font-medium ${typeFilter === 'all' ? (isDark ? 'bg-gray-700 text-gray-100' : 'bg-gray-100 text-gray-900') : isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
                            >
                                All
                            </button>
                            <button
                                type="button"
                                onClick={() => onTypeFilterChange('leads')}
                                className={`px-3 py-1.5 text-sm font-medium ${typeFilter === 'leads' ? (isDark ? 'bg-gray-700 text-gray-100' : 'bg-gray-100 text-gray-900') : isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
                            >
                                Leads
                            </button>
                            <button
                                type="button"
                                onClick={() => onTypeFilterChange('opportunities')}
                                className={`px-3 py-1.5 text-sm font-medium ${typeFilter === 'opportunities' ? (isDark ? 'bg-gray-700 text-gray-100' : 'bg-gray-100 text-gray-900') : isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
                            >
                                Opportunities
                            </button>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <input
                                type="search"
                                value={searchTerm}
                                onChange={(event) => setSearchTerm(event.target.value)}
                                placeholder="Search pipeline..."
                                className={`pl-9 pr-3 py-2 text-sm rounded-lg border ${isDark ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-400' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-500 focus:bg-white'} focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                            />
                            <i className={`fas fa-search absolute left-3 top-2.5 text-sm ${isDark ? 'text-gray-400' : 'text-gray-400'}`}></i>
                            {searchTerm && (
                                <button
                                    type="button"
                                    className={`absolute right-3 top-2.5 text-sm ${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-400 hover:text-gray-600'}`}
                                    onClick={() => setSearchTerm('')}
                                >
                                    <i className="fas fa-times"></i>
                                </button>
                            )}
                        </div>
                        <div
                            className={`flex items-center gap-2 text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'} transition-opacity duration-200`}
                            style={{
                                visibility: showLoadingIndicator ? 'visible' : 'hidden',
                                opacity: showLoadingIndicator ? 1 : 0
                            }}
                            aria-hidden={!showLoadingIndicator}
                        >
                            {showLoadingIndicator && (
                                <i className="fas fa-circle-notch fa-spin"></i>
                            )}
                            <span>Loading</span>
                        </div>
                    </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border shadow-sm p-4`}>
                        <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Total Items</div>
                        <div className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{totals.total}</div>
                    </div>
                    <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border shadow-sm p-4`}>
                        <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Leads</div>
                        <div className={`text-2xl font-bold ${isDark ? 'text-purple-200' : 'text-purple-600'}`}>{totals.leads}</div>
                    </div>
                    <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border shadow-sm p-4`}>
                        <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Opportunities</div>
                        <div className={`text-2xl font-bold ${isDark ? 'text-teal-200' : 'text-teal-600'}`}>{totals.opportunities}</div>
                    </div>
                    <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border shadow-sm p-4`}>
                        <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Pipeline Value</div>
                        <div className={`text-2xl font-bold ${isDark ? 'text-green-200' : 'text-green-600'}`}>{formatCurrency(totals.value)}</div>
                    </div>
                </div>
                <div className="grid gap-3 md:grid-cols-4 sm:grid-cols-2">
                    {stageSummaries.map((summary) => (
                        <div
                            key={summary.stage}
                            className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border shadow-sm p-4`}
                        >
                            <div className={`text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{summary.stage}</div>
                            <div className={`mt-2 text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{summary.count}</div>
                            <div className={`mt-1 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                {formatCurrency(summary.value)}
                            </div>
                        </div>
                    ))}
                </div>
                {renderListView()}
            </div>
        );
    });

    // Leads List View
    // Note: Lead status is now hardcoded as 'active' - removed handleLeadStatusChange function

    const LeadsListView = () => (
        <div className={`${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} rounded-xl shadow-sm border flex flex-col h-full w-full`}>
            <div className={`flex items-center justify-between px-4 py-2 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                <span className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Leads</span>
                <div className="flex items-center gap-4">
                    <button
                        type="button"
                        onClick={() => loadLeads(true)}
                        disabled={isLeadsLoading}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}`}
                    >
                        <i className={`fas fa-sync-alt text-xs ${isLeadsLoading ? 'animate-spin' : ''}`}></i>
                        {isLeadsLoading ? 'Refreshing…' : 'Refresh leads'}
                    </button>
                </div>
            </div>
            <div className="flex-1 overflow-auto w-full">
                <table className={`w-full divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-200'}`} style={{ width: '100%' }}>
                    <thead className={isDark ? 'bg-gray-800' : 'bg-gray-50'}>
                        <tr>
                            <th 
                                className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider cursor-pointer ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                                onClick={() => handleLeadSort('name')}
                            >
                                <div className="flex items-center">
                                    Lead
                                    {leadSortField === 'name' && (
                                        <i className={`fas fa-sort-${leadSortDirection === 'asc' ? 'up' : 'down'} ml-1 text-xs`}></i>
                                    )}
                                </div>
                            </th>
                            <th 
                                className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider cursor-pointer ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                                onClick={() => handleLeadSort('industry')}
                            >
                                <div className="flex items-center">
                                    Industry
                                    {leadSortField === 'industry' && (
                                        <i className={`fas fa-sort-${leadSortDirection === 'asc' ? 'up' : 'down'} ml-1 text-xs`}></i>
                                    )}
                                </div>
                            </th>
                            <th 
                                className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider cursor-pointer ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                                onClick={() => handleLeadSort('status')}
                            >
                                <div className="flex items-center">
                                    Stage
                                    {leadSortField === 'status' && (
                                        <i className={`fas fa-sort-${leadSortDirection === 'asc' ? 'up' : 'down'} ml-1 text-xs`}></i>
                                    )}
                                </div>
                            </th>
                            <th 
                                className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider cursor-pointer ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                                onClick={() => handleLeadSort('stage')}
                            >
                                <div className="flex items-center">
                                    AIDA Status
                                    {leadSortField === 'stage' && (
                                        <i className={`fas fa-sort-${leadSortDirection === 'asc' ? 'up' : 'down'} ml-1 text-xs`}></i>
                                    )}
                                </div>
                            </th>
                            <th 
                                className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider cursor-pointer ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                                onClick={() => handleLeadSort('companyGroup')}
                            >
                                <div className="flex items-center">
                                    Company Group
                                    {leadSortField === 'companyGroup' && (
                                        <i className={`fas fa-sort-${leadSortDirection === 'asc' ? 'up' : 'down'} ml-1 text-xs`}></i>
                                    )}
                                </div>
                            </th>
                            <th className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider`}>
                                External Agent
                            </th>
                        </tr>
                    </thead>
                    <tbody className={`${isDark ? 'bg-gray-900 divide-gray-800' : 'bg-white divide-gray-100'} divide-y`}>
                        {paginatedLeads.length === 0 ? (
                            <tr>
                                <td colSpan="6" className={`px-6 py-12 text-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                    <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                                        <i className="fas fa-user-plus text-2xl text-gray-400"></i>
                                    </div>
                                    <p className="text-lg font-medium mb-2">No leads found</p>
                                    <p className="text-sm">Get started by adding your first lead</p>
                                </td>
                            </tr>
                        ) : (
                            paginatedLeads.flatMap(lead => {
                                const sites = lead.clientSites || lead.sites || [];
                                const siteRows = showSitesInLeadsList ? (Array.isArray(sites) ? sites : []) : [];
                                return [
                                    <tr 
                                        key={`lead-${lead.id}-${lead.name}`}
                                        onClick={() => handleOpenLead(lead)}
                                        className={`${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-50'} cursor-pointer transition`}
                                    >
                                        <td className="px-6 py-2 whitespace-nowrap">
                                            <div className="flex items-center gap-3">
                                                <button
                                                    onClick={(e) => handleToggleStar(e, lead, true)}
                                                    className={`flex-shrink-0 w-5 h-5 flex items-center justify-center transition-colors ${isDark ? 'hover:text-yellow-400' : 'hover:text-yellow-600'}`}
                                                    title={lead.isStarred ? 'Unstar this lead' : 'Star this lead'}
                                                >
                                                    <i className={`${lead.isStarred ? 'fas' : 'far'} fa-star ${lead.isStarred ? 'text-yellow-500' : isDark ? 'text-white' : 'text-gray-300'}`}></i>
                                                </button>
                                                {lead.thumbnail ? (
                                                    <img src={lead.thumbnail} alt={lead.name} className="w-8 h-8 rounded-full object-cover border border-gray-200" />
                                                ) : (
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                                                        {(lead.name || '?').charAt(0).toUpperCase()}
                                                    </div>
                                                )}
                                                <div className={`text-sm font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{lead.name}</div>
                                            </div>
                                        </td>
                                        <td className={`px-6 py-2 whitespace-nowrap text-sm ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{lead.industry}</td>
                                        <td className="px-6 py-2 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                            <select
                                                value={['Potential','Active','Inactive','On Hold','Qualified','Disinterested','Proposal','Tender'].find(s => s.toLowerCase() === ((lead.status || 'potential').toLowerCase())) || 'Potential'}
                                                onChange={e => handleUpdateLeadStatus(lead.id, e.target.value)}
                                                className={`w-full min-w-[7rem] px-2 py-1 text-xs font-medium rounded-full border-0 cursor-pointer appearance-none focus:ring-1 focus:ring-offset-0 ${
                                                    (lead.status || '').toLowerCase() === 'active' ? (isDark ? 'bg-green-900 text-green-200' : 'bg-green-100 text-green-800') :
                                                    (lead.status || '').toLowerCase() === 'potential' ? (isDark ? 'bg-blue-900 text-blue-200' : 'bg-blue-100 text-blue-800') :
                                                    (lead.status || '').toLowerCase() === 'proposal' ? (isDark ? 'bg-purple-900 text-purple-200' : 'bg-purple-100 text-purple-800') :
                                                    (lead.status || '').toLowerCase() === 'tender' ? (isDark ? 'bg-orange-900 text-orange-200' : 'bg-orange-100 text-orange-800') :
                                                    (lead.status || '').toLowerCase() === 'disinterested' ? (isDark ? 'bg-red-900 text-red-200' : 'bg-red-100 text-red-800') :
                                                    (isDark ? 'bg-gray-700 text-gray-200 border-gray-600' : 'bg-gray-100 text-gray-800 border-gray-200')
                                                }`}
                                            >
                                                <option value="Potential">Potential</option>
                                                <option value="Active">Active</option>
                                                <option value="Inactive">Inactive</option>
                                                <option value="On Hold">On Hold</option>
                                                <option value="Qualified">Qualified</option>
                                                <option value="Disinterested">Disinterested</option>
                                                <option value="Proposal">Proposal</option>
                                                <option value="Tender">Tender</option>
                                            </select>
                                        </td>
                                        <td className="px-6 py-2 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                            <select
                                                value={['No Engagement','Awareness','Interest','Desire','Action'].find(s => s.toLowerCase() === ((lead.stage || 'awareness').toLowerCase())) || 'Awareness'}
                                                onChange={e => handleUpdateLeadStage(lead.id, e.target.value)}
                                                className={`w-full min-w-[6.5rem] px-2 py-1 text-xs font-medium rounded-full border-0 cursor-pointer appearance-none focus:ring-1 focus:ring-offset-0 ${
                                                    (lead.stage || '').toLowerCase() === 'no engagement' ? (isDark ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-800') :
                                                    (lead.stage || '').toLowerCase() === 'awareness' ? (isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-800') :
                                                    (lead.stage || '').toLowerCase() === 'interest' ? (isDark ? 'bg-blue-900 text-blue-200' : 'bg-blue-100 text-blue-800') :
                                                    (lead.stage || '').toLowerCase() === 'desire' ? (isDark ? 'bg-yellow-900 text-yellow-200' : 'bg-yellow-100 text-yellow-800') :
                                                    (isDark ? 'bg-green-900 text-green-200' : 'bg-green-100 text-green-800')
                                                }`}
                                            >
                                                <option value="No Engagement">No Engagement</option>
                                                <option value="Awareness">Awareness</option>
                                                <option value="Interest">Interest</option>
                                                <option value="Desire">Desire</option>
                                                <option value="Action">Action</option>
                                            </select>
                                        </td>
                                        <td className={`px-6 py-2 whitespace-nowrap text-sm ${isDark ? 'text-gray-200' : 'text-gray-900'}`} onClick={e => e.stopPropagation()}>
                                            <select
                                                value={((lead.groupMemberships && lead.groupMemberships[0] && (lead.groupMemberships[0].groupId || (lead.groupMemberships[0].group && lead.groupMemberships[0].group.id))) || '').toString()}
                                                onChange={e => handleUpdateLeadCompanyGroup(lead.id, e.target.value || null)}
                                                className={`w-full min-w-[6rem] px-2 py-1 text-xs rounded border cursor-pointer appearance-none ${isDark ? 'bg-gray-800 text-gray-200 border-gray-600' : 'bg-white text-gray-800 border-gray-200'}`}
                                            >
                                                <option value="">None</option>
                                                {groups.map(g => (
                                                    <option key={g.id} value={g.id}>{g.name}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className={`px-6 py-2 whitespace-nowrap text-sm ${isDark ? 'text-gray-200' : 'text-gray-700'}`} onClick={e => e.stopPropagation()}>
                                            <select
                                                value={lead.externalAgentId || ''}
                                                onChange={e => handleUpdateLeadExternalAgent(lead.id, e.target.value || null)}
                                                className={`w-full min-w-[5.5rem] px-2 py-1 text-xs rounded border cursor-pointer appearance-none ${isDark ? 'bg-gray-800 text-gray-200 border-gray-600' : 'bg-white text-gray-800 border-gray-200'}`}
                                            >
                                                <option value="">—</option>
                                                {externalAgents.map(a => (
                                                    <option key={a.id} value={a.id}>{a.name}</option>
                                                ))}
                                            </select>
                                        </td>
                                    </tr>,
                                    ...siteRows.map((site, siteIdx) => (
                                        <tr
                                            key={`lead-${lead.id}-site-${site.id || siteIdx}`}
                                            onClick={() => handleOpenLeadToSite(lead, site)}
                                            className={`cursor-pointer ${isDark ? 'bg-gray-800/60 hover:bg-gray-800' : 'bg-gray-50/80 hover:bg-gray-100'}`}
                                        >
                                            <td className="px-6 py-1.5 text-sm" style={{ paddingLeft: '5.5rem' }}>
                                                <span className={`inline-flex items-center gap-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`} onClick={e => e.stopPropagation()}>
                                                    <i className="fas fa-map-marker-alt text-xs opacity-70 flex-shrink-0"></i>
                                                    <span>
                                                        {site.name || 'Unnamed site'}
                                                        {site.address ? <span className="text-xs opacity-80"> — {site.address}</span> : null}
                                                    </span>
                                                </span>
                                            </td>
                                            <td className={`px-6 py-1.5 whitespace-nowrap text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                                                {lead.industry || '—'}
                                            </td>
                                            <td className="px-6 py-1.5 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                                <select
                                                    value={['Potential','Active','Inactive','On Hold','Qualified','Disinterested','Proposal','Tender'].find(s => s.toLowerCase() === ((site.stage || 'potential').toLowerCase())) || 'Potential'}
                                                    onChange={e => handleUpdateSiteStage(lead, site, siteIdx, e.target.value)}
                                                    className={`w-full min-w-[7rem] px-2 py-1 text-xs font-medium rounded-full border-0 cursor-pointer appearance-none focus:ring-1 focus:ring-offset-0 ${
                                                        (site.stage || '').toLowerCase() === 'active' ? (isDark ? 'bg-green-900 text-green-200' : 'bg-green-100 text-green-800') :
                                                        (site.stage || '').toLowerCase() === 'potential' ? (isDark ? 'bg-blue-900 text-blue-200' : 'bg-blue-100 text-blue-800') :
                                                        (site.stage || '').toLowerCase() === 'proposal' ? (isDark ? 'bg-purple-900 text-purple-200' : 'bg-purple-100 text-purple-800') :
                                                        (site.stage || '').toLowerCase() === 'tender' ? (isDark ? 'bg-orange-900 text-orange-200' : 'bg-orange-100 text-orange-800') :
                                                        (site.stage || '').toLowerCase() === 'disinterested' ? (isDark ? 'bg-red-900 text-red-200' : 'bg-red-100 text-red-800') :
                                                        (isDark ? 'bg-gray-700 text-gray-200 border-gray-600' : 'bg-gray-100 text-gray-800 border-gray-200')
                                                    }`}
                                                >
                                                    <option value="Potential">Potential</option>
                                                    <option value="Active">Active</option>
                                                    <option value="Inactive">Inactive</option>
                                                    <option value="On Hold">On Hold</option>
                                                    <option value="Qualified">Qualified</option>
                                                    <option value="Disinterested">Disinterested</option>
                                                    <option value="Proposal">Proposal</option>
                                                    <option value="Tender">Tender</option>
                                                </select>
                                            </td>
                                            <td className="px-6 py-1.5 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                                <select
                                                    value={['No Engagement','Awareness','Interest','Desire','Action'].find(s => s.toLowerCase() === ((site.aidaStatus || 'awareness').toLowerCase())) || 'Awareness'}
                                                    onChange={e => handleUpdateSiteAidaStatus(lead, site, siteIdx, e.target.value)}
                                                    className={`w-full min-w-[6.5rem] px-2 py-1 text-xs font-medium rounded-full border-0 cursor-pointer appearance-none focus:ring-1 focus:ring-offset-0 ${
                                                        (site.aidaStatus || '').toLowerCase() === 'no engagement' ? (isDark ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-800') :
                                                        (site.aidaStatus || '').toLowerCase() === 'awareness' ? (isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-800') :
                                                        (site.aidaStatus || '').toLowerCase() === 'interest' ? (isDark ? 'bg-blue-900 text-blue-200' : 'bg-blue-100 text-blue-800') :
                                                        (site.aidaStatus || '').toLowerCase() === 'desire' ? (isDark ? 'bg-yellow-900 text-yellow-200' : 'bg-yellow-100 text-yellow-800') :
                                                        (isDark ? 'bg-green-900 text-green-200' : 'bg-green-100 text-green-800')
                                                    }`}
                                                >
                                                    <option value="No Engagement">No Engagement</option>
                                                    <option value="Awareness">Awareness</option>
                                                    <option value="Interest">Interest</option>
                                                    <option value="Desire">Desire</option>
                                                    <option value="Action">Action</option>
                                                </select>
                                            </td>
                                            <td className={`px-6 py-1.5 whitespace-nowrap text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>—</td>
                                            <td className={`px-6 py-1.5 whitespace-nowrap text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>—</td>
                                        </tr>
                                    ))
                                ];
                            })
                        )}
                    </tbody>
                </table>
            </div>
            {/* Pagination Controls */}
            {sortedLeads.length > 0 && (
                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-t px-6 py-4 flex items-center justify-between pr-32 flex-shrink-0`}>
                    <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        Showing {leadsStartIndex + 1} to {Math.min(leadsEndIndex, sortedLeads.length)} of {sortedLeads.length} leads
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setLeadsPage(leadsPage - 1)}
                            disabled={leadsPage === 1}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isDark ? 'bg-gray-800 hover:bg-gray-750 border border-gray-700 text-gray-200' : 'bg-white hover:bg-gray-50 border border-gray-200 text-gray-700'} disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            <i className="fas fa-chevron-left mr-1"></i>
                            Previous
                        </button>
                        <span className={`px-4 py-2 text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            Page {leadsPage} of {totalLeadsPages}
                        </span>
                        <button
                            onClick={() => setLeadsPage(leadsPage + 1)}
                            disabled={leadsPage === totalLeadsPages}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isDark ? 'bg-gray-800 hover:bg-gray-750 border border-gray-700 text-gray-200' : 'bg-white hover:bg-gray-50 border border-gray-200 text-gray-700'} disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            Next
                            <i className="fas fa-chevron-right ml-1"></i>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );

    // Full-page Client Detail View
    const ClientDetailView = () => {
        const ClientDetailModalComponent = useEnsureGlobalComponent('ClientDetailModal');
        // Prioritize selectedClientRef.current (set immediately on click), then try to find in clients array
        const selectedClient = selectedClientRef.current || 
            (editingClientId ? clients.find(c => c.id === editingClientId) : null);
        // Use fullClientForDetail when available so modal gets KYC and other server fields without waiting for its own fetch
        const clientForModal = fullClientForDetail && fullClientForDetail.id === editingClientId
            ? fullClientForDetail
            : selectedClient;
        
        return (
        <div className={`min-h-screen ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
            {/* Header with breadcrumb */}
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b px-6 py-4`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <button 
                            type="button"
                            onClick={handleClientModalClose}
                            className={`${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'} flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200`}
                            title="Go back"
                        >
                            <i className="fas fa-arrow-left"></i>
                        </button>
                        <div className="flex items-center space-x-3">
                            <div className={`w-2 h-2 rounded-full ${isDark ? 'bg-primary-400' : 'bg-primary-600'}`}></div>
                            <h1 className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                {selectedClient ? selectedClient.name : 'New Client'}
                            </h1>
                        </div>
                    </div>
                    {/* Edit mode removed - always allow editing */}
                </div>
            </div>

            {/* Full-page client detail content */}
            <div className="p-6">
                {ClientDetailModalComponent ? (
                    <ClientDetailModalComponent
                        key={editingClientId || 'new-client'}
                        client={clientForModal}
                        onSave={handleSaveClient}
                        onClose={handleClientModalClose}
                        onDelete={handleDeleteClient}
                        allProjects={projects}
                        onNavigateToProject={handleNavigateToProject}
                        isFullPage={true}
                        initialTab={currentTab}
                        onTabChange={setCurrentTab}
                        initialSiteId={openSiteIdForClient}
                        onInitialSiteOpened={() => setOpenSiteIdForClient(null)}
                        onOpenOpportunity={(opportunityId, client) => {
                            setSelectedOpportunityId(opportunityId);
                            setSelectedOpportunityClient(client || selectedClient);
                            setViewMode('opportunity-detail');
                        }}
                    />
                ) : (
                    <div className="text-center py-8 text-gray-500">
                        <i className="fas fa-spinner fa-spin text-3xl mb-2"></i>
                        <p>Loading client details…</p>
                    </div>
                )}
            </div>
        </div>
        );
    };

    // Full-page Lead Detail View
    const LeadDetailView = () => {
        // Use ClientDetailModal for leads too - unified UI
        const ClientDetailModalComponent = useEnsureGlobalComponent('ClientDetailModal');
        // Prefer the ref (updated immediately on click) and fall back to leads state lookup
        const selectedLead = selectedLeadRef.current ||
            (editingLeadId && Array.isArray(leads) ? leads.find(l => l.id === editingLeadId) : null);
        
        return (
        <div className={`min-h-screen ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
            {/* Header with breadcrumb */}
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b px-6 py-4`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <button 
                            onClick={() => {
                                handleLeadModalClose();
                            }}
                            className={`${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'} flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200`}
                            title="Go back"
                        >
                            <i className="fas fa-arrow-left"></i>
                        </button>
                        <div className="flex items-center space-x-3">
                            <div className={`w-2 h-2 rounded-full ${isDark ? 'bg-yellow-400' : 'bg-yellow-500'}`}></div>
                            <h1 className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                {selectedLead ? selectedLead.name : 'New Lead'}
                            </h1>
                        </div>
                    </div>
                    {/* Edit mode removed - always allow editing */}
                </div>
            </div>

            {/* Full-page lead detail content - using unified ClientDetailModal */}
            <div className="p-6">
                {ClientDetailModalComponent ? (
                    <ClientDetailModalComponent
                        key={editingLeadId || 'new-lead'}
                        client={selectedLead} // Use 'client' prop (ClientDetailModal handles both)
                        entityType="lead" // Tell modal it's a lead
                        onSave={handleSaveLead}
                        onClose={handleLeadModalClose}
                        onDelete={handleDeleteLead}
                        onConvertToClient={convertLeadToClient} // Keep this for lead-to-client conversion
                        allProjects={projects}
                        onNavigateToProject={handleNavigateToProject}
                        isFullPage={true}
                        initialTab={currentLeadTab}
                        onTabChange={setCurrentLeadTab}
                        onPauseSync={handlePauseSync}
                        initialSiteId={openSiteIdForLead}
                        onInitialSiteOpened={() => setOpenSiteIdForLead(null)}
                    />
                ) : (
                    <div className="text-center py-8 text-gray-500">
                        <i className="fas fa-spinner fa-spin text-3xl mb-2"></i>
                        <p>Loading lead details…</p>
                    </div>
                )}
            </div>
        </div>
        );
    };

    // Full-page Opportunity Detail View
    const OpportunityDetailView = ({ opportunityId, client, onClose }) => {
        const OpportunityDetailModalComponent = useEnsureGlobalComponent('OpportunityDetailModal');
        return (
            <div className={`min-h-screen ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
                {/* Header with breadcrumb */}
                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b px-6 py-4`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <button 
                                onClick={onClose}
                                className={`${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'} flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200`}
                                title="Go back"
                            >
                                <i className="fas fa-arrow-left"></i>
                            </button>
                            <div className="flex items-center space-x-3">
                                <div className={`w-2 h-2 rounded-full ${isDark ? 'bg-green-400' : 'bg-green-500'}`}></div>
                                <h1 className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                    Opportunity Details
                                </h1>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Full-page opportunity detail content */}
                <div className="p-6">
                    {OpportunityDetailModalComponent ? (
                        <OpportunityDetailModalComponent
                            key={opportunityId}
                            opportunityId={opportunityId}
                            client={client}
                            onClose={onClose}
                            isFullPage={true}
                        />
                    ) : (
                        <div className="text-center py-8 text-gray-500">
                            <i className="fas fa-spinner fa-spin text-3xl mb-2"></i>
                            <p>Loading opportunity details…</p>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // Removed render logging to reduce console spam during infinite loops

    return (
        <div className="flex flex-col h-full w-full max-w-full overflow-hidden" style={{ width: '100%', maxWidth: '100%', minWidth: '100%', height: '100%', minHeight: '100%' }}>
            <div className="flex-shrink-0 space-y-5 sm:space-y-8 pr-2 sm:pr-4 pt-5 sm:pt-6 pb-2 w-full max-w-full" style={{ width: '100%', maxWidth: '100%' }}>
            {/* Modern Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-6 pb-2">
                <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                    <div className={`w-10 h-10 sm:w-12 sm:h-12 ${isDark ? 'bg-gray-800' : 'bg-gray-100'} rounded-xl flex items-center justify-center flex-shrink-0`}>
                        <i className={`fas fa-users ${isDark ? 'text-gray-300' : 'text-gray-600'} text-sm sm:text-lg`}></i>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                                <h1 
                                    id="clients-leads-heading"
                                    className={`text-xl sm:text-2xl font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}
                                >
                                    CRM
                                </h1>
                                <p 
                                    className={`text-sm mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}
                                >
                                    Manage clients and leads
                                </p>
                            </div>
                            {SectionCommentWidget && (
                                <div className="hidden sm:block flex-shrink-0">
                                    <SectionCommentWidget 
                                        sectionId="clients-main"
                                        sectionName="Clients and Leads"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                
                {/* Modern Action Buttons */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-3 pr-4 sm:pr-6">
                    <button 
                    onClick={() => {
                        stopSync();
                        setEditingClientId(null); // null = new client
                        setEditingLeadId(null);
                        selectedClientRef.current = null;
                        selectedLeadRef.current = null;
                        isFormOpenRef.current = true;
                        setCurrentTab('overview');
                        setViewMode('client-detail');
                        // Update URL to reflect new client form
                        if (window.RouteState) {
                            window.RouteState.setPageSubpath('clients', ['new'], {
                                replace: false,
                                preserveSearch: false,
                                preserveHash: false
                            });
                        }
                    }}
                        className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 min-h-[44px] sm:min-h-0 ${
                            isDark 
                                ? 'bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-750' 
                                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                        }`}
                    >
                        <i className={`fas fa-plus text-xs ${isDark ? 'text-gray-300' : 'text-gray-600'}`}></i>
                        <span>Add Client</span>
                    </button>
                    <button 
                    onClick={() => {
                        stopSync();
                        setEditingLeadId(null); // null = new lead
                        setEditingClientId(null);
                        selectedLeadRef.current = null;
                        selectedClientRef.current = null;
                        isFormOpenRef.current = true;
                        setCurrentLeadTab('overview');
                        setViewMode('lead-detail');
                        // Update URL to reflect new lead form
                        if (window.RouteState) {
                            window.RouteState.setPageSubpath('clients', ['leads', 'new'], {
                                replace: false,
                                preserveSearch: false,
                                preserveHash: false
                            });
                        }
                    }}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-all duration-200 min-h-[44px] sm:min-h-0"
                    >
                        <i className="fas fa-plus text-xs"></i>
                        <span>Add Lead</span>
                    </button>
                </div>
            </div>

            {/* Modern View Tabs */}
            <div className={`${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} rounded-xl border p-1.5 sm:p-1 flex sm:inline-flex shadow-sm overflow-x-auto sm:overflow-x-visible mb-2 gap-1`}>
                <button
                    type="button"
                    onClick={() => {
                        // Only update if viewMode is actually changing
                        if (viewMode !== 'groups') {
                            // Clear selected entities and close any open modals
                            selectedClientRef.current = null;
                            selectedLeadRef.current = null;
                            isFormOpenRef.current = false;
                            setViewMode('groups');
                            // Clear URL segments to prevent route handler from reopening entities
                            if (window.RouteState && window.RouteState.navigate) {
                                try {
                                    window.RouteState.navigate({
                                        page: 'clients',
                                        segments: [],
                                        search: '',
                                        hash: '',
                                        replace: false,
                                        preserveSearch: false,
                                        preserveHash: false
                                    });
                                } catch (routeError) {
                                    // Silently fail - URL update is non-critical
                                }
                            }
                        }
                    }}
                    className={`px-3 sm:px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap min-h-[44px] sm:min-h-0 flex-shrink-0 ${
                        viewMode === 'groups' 
                            ? 'bg-gray-100 text-gray-900 shadow-sm' 
                            : isDark 
                                ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' 
                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <i className="fas fa-layer-group mr-2"></i>
                    <span className="hidden sm:inline">Groups ({groupsCount})</span>
                    <span className="sm:hidden">Groups</span>
                </button>
                <button
                    onClick={() => {
                        // Clear selected entities and close any open modals
                        selectedClientRef.current = null;
                        selectedLeadRef.current = null;
                        isFormOpenRef.current = false;
                        setViewMode('clients');
                        // Clear URL segments to prevent route handler from reopening entities
                        if (window.RouteState && window.RouteState.navigate) {
                            try {
                                window.RouteState.navigate({
                                    page: 'clients',
                                    segments: [],
                                    search: '',
                                    hash: '',
                                    replace: false,
                                    preserveSearch: false,
                                    preserveHash: false
                                });
                            } catch (routeError) {
                                // Silently fail - URL update is non-critical
                            }
                        }
                    }}
                    className={`px-3 sm:px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap min-h-[44px] sm:min-h-0 flex-shrink-0 ${
                        viewMode === 'clients' 
                            ? 'bg-gray-100 text-gray-900 shadow-sm' 
                            : isDark 
                                ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' 
                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <i className="fas fa-building mr-2"></i>
                    <span className="hidden sm:inline">Clients ({clientsCount})</span>
                    <span className="sm:hidden">Clients</span>
                </button>
                <button
                    onClick={() => {
                        // Clear selected entities and close any open modals
                        selectedClientRef.current = null;
                        selectedLeadRef.current = null;
                        isFormOpenRef.current = false;
                        setViewMode('leads');
                        // Clear URL segments to prevent route handler from reopening entities
                        if (window.RouteState && window.RouteState.navigate) {
                            try {
                                window.RouteState.navigate({
                                    page: 'clients',
                                    segments: [],
                                    search: '',
                                    hash: '',
                                    replace: false,
                                    preserveSearch: false,
                                    preserveHash: false
                                });
                            } catch (routeError) {
                                // Silently fail - URL update is non-critical
                            }
                        }
                    }}
                    className={`px-3 sm:px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap min-h-[44px] sm:min-h-0 flex-shrink-0 ${
                        viewMode === 'leads' 
                            ? 'bg-gray-100 text-gray-900 shadow-sm' 
                            : isDark 
                                ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' 
                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <i className="fas fa-star mr-2"></i>
                    <span className="hidden sm:inline">Leads ({leadsCount})</span>
                    <span className="sm:hidden">Leads</span>
                </button>
                <button
                    onClick={() => {
                        // Clear selected entities and close any open modals
                        selectedClientRef.current = null;
                        selectedLeadRef.current = null;
                        isFormOpenRef.current = false;
                        setViewMode('pipeline');
                        // Clear URL segments to prevent route handler from reopening entities
                        if (window.RouteState && window.RouteState.navigate) {
                            try {
                                window.RouteState.navigate({
                                    page: 'clients',
                                    segments: [],
                                    search: '',
                                    hash: '',
                                    replace: false,
                                    preserveSearch: false,
                                    preserveHash: false
                                });
                            } catch (routeError) {
                                // Silently fail - URL update is non-critical
                            }
                        }
                    }}
                    className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                        viewMode === 'pipeline' 
                            ? 'bg-gray-100 text-gray-900 shadow-sm' 
                            : isDark 
                                ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' 
                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <i className="fas fa-stream mr-2"></i>
                    Pipeline
                </button>
                <button
                    onClick={() => {
                        // Clear selected entities and close any open modals
                        selectedClientRef.current = null;
                        selectedLeadRef.current = null;
                        isFormOpenRef.current = false;
                        setViewMode('news-feed');
                        // Clear URL segments to prevent route handler from reopening entities
                        if (window.RouteState && window.RouteState.navigate) {
                            try {
                                window.RouteState.navigate({
                                    page: 'clients',
                                    segments: [],
                                    search: '',
                                    hash: '',
                                    replace: false,
                                    preserveSearch: false,
                                    preserveHash: false
                                });
                            } catch (routeError) {
                                // Silently fail - URL update is non-critical
                            }
                        }
                    }}
                    className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                        viewMode === 'news-feed' 
                            ? 'bg-gray-100 text-gray-900 shadow-sm' 
                            : isDark 
                                ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' 
                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <i className="fas fa-newspaper mr-2"></i>
                    News Feed
                </button>
            </div>

        {/* Modern Search and Filters */}
        {viewMode !== 'client-detail' && viewMode !== 'lead-detail' && viewMode !== 'pipeline' && (
                <div className={`${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} rounded-xl border p-5 sm:p-6 shadow-sm`}>
                    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 ${viewMode === 'leads' ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>
                        <div className="sm:col-span-2 lg:col-span-1">
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="Search by name, industry, contact, or services..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-colors ${
                                        isDark 
                                            ? 'bg-gray-800 border-gray-700 text-gray-200 placeholder-gray-400 focus:bg-gray-800' 
                                            : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-500 focus:bg-white'
                                    }`}
                                />
                                <i className={`fas fa-search absolute left-3 top-3.5 text-sm ${
                                    isDark ? 'text-gray-400' : 'text-gray-400'
                                }`}></i>
                                {searchTerm && (
                                    <button
                                        onClick={() => setSearchTerm('')}
                                        className={`absolute right-3 top-3.5 transition-colors ${
                                            isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-400 hover:text-gray-600'
                                        }`}
                                        title="Clear search"
                                    >
                                        <i className="fas fa-times text-sm"></i>
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <select
                                value={filterIndustry}
                                onChange={(e) => setFilterIndustry(e.target.value)}
                                className={`flex-1 px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-colors ${
                                    isDark 
                                        ? 'bg-gray-800 border-gray-700 text-gray-200 focus:bg-gray-800' 
                                        : 'bg-gray-50 border-gray-200 text-gray-900 focus:bg-white'
                                }`}
                            >
                                <option value="All Industries">All Industries</option>
                                {allIndustries.map((industry) => (
                                    <option key={industry} value={industry}>
                                        {industry}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <select
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-colors ${
                                    isDark 
                                        ? 'bg-gray-800 border-gray-700 text-gray-200 focus:bg-gray-800' 
                                        : 'bg-gray-50 border-gray-200 text-gray-900 focus:bg-white'
                                }`}
                            >
                                <option value="All Status">All Status</option>
                                {allStatuses.map((status) => (
                                    <option key={status} value={status}>
                                        {status}
                                    </option>
                                ))}
                            </select>
                        </div>
                        {viewMode === 'leads' && (
                            <div>
                                <select
                                    value={filterStage}
                                    onChange={(e) => setFilterStage(e.target.value)}
                                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-colors ${
                                        isDark 
                                            ? 'bg-gray-700 border-gray-600 text-gray-200 focus:bg-gray-700' 
                                            : 'bg-gray-50 border-gray-300 text-gray-900 focus:bg-white'
                                    }`}
                                >
                                    <option value="All Stages">All Stages</option>
                                    {allStages.map((stage) => (
                                        <option key={stage} value={stage}>
                                            {stage}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        {viewMode !== 'leads' && (
                            <div>
                                <ServicesDropdown
                                    services={allServices}
                                    selectedServices={filterServices}
                                    onSelectionChange={setFilterServices}
                                    isDark={isDark}
                                />
                            </div>
                        )}
                        <div className="flex items-center gap-6 flex-nowrap">
                            <label className="inline-flex items-center gap-2 cursor-pointer flex-shrink-0">
                                <input
                                    type="checkbox"
                                    checked={showStarredOnly}
                                    onChange={(e) => setShowStarredOnly(e.target.checked)}
                                    className={`w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${isDark ? 'bg-gray-700 border-gray-600' : ''}`}
                                />
                                <span className={`text-sm whitespace-nowrap ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                                    <i className="fas fa-star text-yellow-500 mr-1"></i>
                                    Starred Only
                                </span>
                            </label>
                            {viewMode === 'leads' && (
                                <label className="inline-flex items-center gap-2 cursor-pointer flex-shrink-0" title="Show or hide site rows under each lead">
                                    <input
                                        type="checkbox"
                                        checked={showSitesInLeadsList}
                                        onChange={(e) => setShowSitesInLeadsList(e.target.checked)}
                                        className={`w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${isDark ? 'bg-gray-700 border-gray-600' : ''}`}
                                    />
                                    <span className={`text-sm whitespace-nowrap ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                                        <i className="fas fa-map-marker-alt text-amber-500 mr-1"></i>
                                        Show sites
                                    </span>
                                </label>
                            )}
                            {viewMode === 'clients' && (
                                <label className="inline-flex items-center gap-2 cursor-pointer flex-shrink-0" title="Show or hide site rows under each client">
                                    <input
                                        type="checkbox"
                                        checked={showSitesInClientsList}
                                        onChange={(e) => setShowSitesInClientsList(e.target.checked)}
                                        className={`w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${isDark ? 'bg-gray-700 border-gray-600' : ''}`}
                                    />
                                    <span className={`text-sm whitespace-nowrap ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                                        <i className="fas fa-map-marker-alt text-amber-500 mr-1"></i>
                                        Show sites
                                    </span>
                                </label>
                            )}
                        </div>
                    </div>
                    
                    {/* Modern Search Results Counter */}
                    {(searchTerm || filterIndustry !== 'All Industries' || filterStatus !== 'All Status' || (viewMode === 'leads' && filterStage !== 'All Stages') || (viewMode !== 'leads' && filterServices.length > 0) || showStarredOnly) && (
                        <div className={`mt-5 sm:mt-6 pt-5 sm:pt-6 border-t ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                    <span>
                                        {(() => {
                                            const searchSuffix = searchTerm ? ` matching "${searchTerm}"` : '';
                                            if (viewMode === 'leads') {
                                                return `Showing ${filteredLeads.length} of ${leads.length} leads${searchSuffix}`;
                                            } else if (viewMode === 'groups') {
                                                return `Showing ${filteredGroups.length} of ${groups.length} groups${searchSuffix}`;
                                            } else {
                                                return `Showing ${filteredClients.length} of ${clients.length} clients${searchSuffix}`;
                                            }
                                        })()}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
        )}

            {/* Content based on view mode */}
            {viewMode === 'clients' && <ClientsListView />}
            {viewMode === 'leads' && <LeadsListView />}
            {viewMode === 'groups' && (
                selectedGroup ? (
                    <GroupDetailView
                        group={selectedGroup}
                        members={groupMembers}
                        isLoading={isLoadingGroupMembers}
                        error={groupMembersError}
                        onBack={() => {
                            setSelectedGroup(null);
                            setGroupMembers([]);
                            setGroupMembersError(null);
                        }}
                        onClientClick={(client) => {
                            stopSync();
                            selectedClientRef.current = client;
                            setEditingClientId(client.id);
                            isFormOpenRef.current = true;
                            setCurrentTab('overview');
                            setViewMode('client-detail');
                        }}
                        onLeadClick={(lead) => {
                            stopSync();
                            selectedLeadRef.current = lead;
                            setEditingLeadId(lead.id);
                            isFormOpenRef.current = true;
                            setCurrentLeadTab('overview');
                            setViewMode('lead-detail');
                        }}
                    />
                ) : (
                    <GroupsListView />
                )
            )}
            {viewMode === 'pipeline' && (
                (window.Pipeline || window.PipelineView) ? (
                    React.createElement(window.Pipeline || window.PipelineView, {
                        clients: clients,
                        leads: leads,
                        onOpenLead: openLeadFromPipeline,
                        onOpenOpportunity: openOpportunityFromPipeline,
                        onOpenClient: openClientFromPipeline
                    })
                ) : (
                    <LegacyPipelineView />
                )
            )}
            {viewMode === 'news-feed' && window.ClientNewsFeed && (
                <window.ClientNewsFeed />
            )}
            {viewMode === 'client-detail' && <ClientDetailView />}
            {viewMode === 'lead-detail' && <LeadDetailView />}
            {viewMode === 'opportunity-detail' && selectedOpportunityId && (
                <OpportunityDetailView
                    opportunityId={selectedOpportunityId}
                    client={selectedOpportunityClient}
                    onClose={() => {
                        setSelectedOpportunityId(null);
                        setSelectedOpportunityClient(null);
                        setViewMode('clients');
                    }}
                />
            )}
            {/* Fallback: If viewMode is unexpected, show clients view */}
            {viewMode !== 'clients' && viewMode !== 'leads' && viewMode !== 'groups' && viewMode !== 'pipeline' 
                && viewMode !== 'news-feed' && viewMode !== 'client-detail' && viewMode !== 'lead-detail' 
                && viewMode !== 'opportunity-detail' && (
                <div className="p-4 text-center text-gray-500">
                    <p>Unexpected view mode: {viewMode}</p>
                    <button 
                        onClick={() => setViewMode('clients')}
                        className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        Show Clients
                    </button>
                </div>
            )}
            </div>
        </div>
    );
});

// Register to window for global access
window.Clients = Clients;

export default Clients;
