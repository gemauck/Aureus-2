// Get dependencies from window
const { useState, useEffect, useMemo, useCallback, useRef } = React;
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
    }
};

// Map of critical modal bundles to ensure they can be recovered if the initial script tag failed to load
const CRITICAL_COMPONENT_SCRIPTS = {
    ClientDetailModal: './dist/src/components/clients/ClientDetailModal.js?v=permanent-block-1762361500',
    LeadDetailModal: './dist/src/components/clients/LeadDetailModal.js?v=lead-fix-1736162400',
    OpportunityDetailModal: './dist/src/components/clients/OpportunityDetailModal.js',
    Pipeline: './dist/src/components/clients/Pipeline.js?v=pipeline-list-view-20251111-hotfix'
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
let isLeadsLoading = false; // Prevent concurrent loadLeads calls
const CACHE_DURATION = 60000; // 60 seconds
const API_CALL_INTERVAL = 10000; // Only call API every 10 seconds max (reduced for faster updates)
const FORCE_REFRESH_MIN_INTERVAL = 2000; // Minimum 2 seconds between force refresh calls
const LIVE_SYNC_THROTTLE = 2000; // Skip LiveDataSync updates if data hasn't changed in 2 seconds

const PIPELINE_STAGES = ['Awareness', 'Interest', 'Desire', 'Action'];
const PIPELINE_STAGE_ALIASES = {
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
        stage: c.stage || 'Awareness',
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
        sites: Array.isArray(c.sites) ? c.sites : (typeof c.sites === 'string' ? JSON.parse(c.sites || '[]') : []),
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
        tags: Array.isArray(c.tags) ? c.tags.map(ct => ct.tag || ct).filter(Boolean) : (c.tags ? [c.tags] : []),
        ownerId: c.ownerId || null,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt
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
        if (selectedServices.includes(service)) {
            onSelectionChange(selectedServices.filter(s => s !== service));
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
            ? selectedServices[0] 
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
                    {services.map(service => {
                        const isSelected = selectedServices.includes(service);
                        return (
                            <label
                                key={service}
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
                                    {service}
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
    const [pipelineBoardView, setPipelineBoardView] = useState('list');
    const [pipelineTypeFilter, setPipelineTypeFilter] = useState('all');
    const PipelineComponent = useEnsureGlobalComponent('Pipeline');
    const isNewPipelineAvailable = Boolean(PipelineComponent);
    const [clients, setClients] = useState([]);
    const [leads, setLeads] = useState([]);
    const clientsRef = useRef(clients); // Ref to track current clients for LiveDataSync
    const leadsRef = useRef(leads);
    const viewModeRef = useRef(viewMode); // Ref to track current viewMode for LiveDataSync
    const isUserEditingRef = useRef(false); // Ref to track if user is editing
    const isAutoSavingRef = useRef(false); // Ref to track if auto-saving is in progress
    const isFormOpenRef = useRef(false); // Ref to track if any form is open
    const selectedClientRef = useRef(null); // Ref to track selected client
    const selectedLeadRef = useRef(null); // Ref to track selected lead
    const pipelineOpportunitiesLoadedRef = useRef(new Map());
    // Keep refs in sync with state
    useEffect(() => {
        clientsRef.current = clients;
    }, [clients]);

    useEffect(() => {
        leadsRef.current = leads;
    }, [leads]);
    
    useEffect(() => {
        viewModeRef.current = viewMode;
    }, [viewMode]);


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
    const [leadsCount, setLeadsCount] = useState(0);
    const [projects, setProjects] = useState([]);
    // Just store IDs - modals fetch their own data
    const [editingClientId, setEditingClientId] = useState(null);
    const [editingLeadId, setEditingLeadId] = useState(null);
    const [selectedOpportunityId, setSelectedOpportunityId] = useState(null);
    const [selectedOpportunityClient, setSelectedOpportunityClient] = useState(null);
    const [currentTab, setCurrentTab] = useState('overview');
    const [currentLeadTab, setCurrentLeadTab] = useState('overview');
    const [searchTerm, setSearchTerm] = useState('');
    const [filterIndustry, setFilterIndustry] = useState('All Industries');
    const [filterStatus, setFilterStatus] = useState('All Status');
    const [filterServices, setFilterServices] = useState(() => {
        try {
            const saved = localStorage.getItem('clients_filterServices');
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });
    
    // Persist filterServices to localStorage whenever it changes
    useEffect(() => {
        try {
            localStorage.setItem('clients_filterServices', JSON.stringify(filterServices));
        } catch (error) {
            console.warn('Failed to save filterServices to localStorage:', error);
        }
    }, [filterServices]);
    const [showStarredOnly, setShowStarredOnly] = useState(false);
    const [sortField, setSortField] = useState('name');
    const [sortDirection, setSortDirection] = useState('asc');
    const [leadSortField, setLeadSortField] = useState('name');
    const [leadSortDirection, setLeadSortDirection] = useState('asc');
    const [clientsPage, setClientsPage] = useState(1);
    const [leadsPage, setLeadsPage] = useState(1);
    const ITEMS_PER_PAGE = 25;
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
            console.log('⚡ Opportunity load already in progress, skipping');
            return;
        }

        // Check if we already have opportunities loaded
        const hasOpportunities = clients.some(c => c.opportunities && c.opportunities.length > 0);
        if (hasOpportunities && pipelineOpportunitiesLoadedRef.current.size > 0) {
            console.log('⚡ Opportunities already loaded, skipping');
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
                const updatedClients = clients.map((client) => {
                    if (!client?.id) {
                        return client;
                    }

                    const apiOpps = opportunitiesByClient[client.id] || [];
                    const signature = buildOpportunitiesSignature(apiOpps);
                    pipelineOpportunitiesLoadedRef.current.set(client.id, { signature });

                    return {
                        ...client,
                        opportunities: apiOpps
                    };
                });

                setClients(updatedClients);
                safeStorage.setClients(updatedClients);
            } catch (error) {
                const isServerError =
                    error?.message?.includes('500') ||
                    error?.message?.includes('Server error') ||
                    error?.message?.includes('Failed to list opportunities');
                if (!isServerError) {
                    console.warn('⚠️ Pipeline: Failed to load opportunities in bulk:', error?.message || error);
                }
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
            console.log('⏸️ LiveDataSync paused for editing');
        }
    }, []);
    
    const startSync = useCallback(() => {
        if (window.LiveDataSync && !window.LiveDataSync.isRunning) {
            window.LiveDataSync.start();
            console.log('▶️ LiveDataSync resumed');
        }
    }, []);

    // Modal callbacks no longer needed - modals own their state
    
    // Stop LiveDataSync when viewing client/lead list, restart when entering detail views
    // Note: Detail views (client-detail, lead-detail) will stop LiveDataSync completely via modals
    useEffect(() => {
        if (!window.LiveDataSync) return;
        
        // Stop sync when viewing list views (clients or leads)
        const isListView = viewMode === 'clients' || viewMode === 'leads' || viewMode === 'pipeline';
        
        if (isListView) {
            // Only stop if not already stopped (avoid duplicate stops)
            if (window.LiveDataSync.isRunning) {
                window.LiveDataSync.stop();
                console.log('⏸️ Clients component: Stopping LiveDataSync (viewing list)');
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
        console.log('🔄 Clients: loadClients() called, forceRefresh:', forceRefresh);
        const loadStartTime = performance.now();
        try {
            // If force refresh, clear caches first
            if (forceRefresh) {
                console.log('🔄 FORCE REFRESH: Clearing caches...');
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
            }
            
            // IMMEDIATELY show cached data without waiting for API (unless force refresh)
            const cachedClients = safeStorage.getClients();
            
            if (cachedClients && cachedClients.length > 0 && !forceRefresh) {
                // Separate clients and leads from cache
                const filteredCachedClients = cachedClients.filter(client => 
                    client.type === 'client'
                );
                const cachedLeads = cachedClients.filter(client => 
                    client.type === 'lead'
                );
                
                // Show cached clients IMMEDIATELY
                if (filteredCachedClients.length > 0) {
                    setClients(filteredCachedClients);
                }
                
                // Show cached leads IMMEDIATELY (this is critical for fast loading!)
                if (cachedLeads.length > 0) {
                    setLeads(cachedLeads);
                    setLeadsCount(cachedLeads.length);
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
                            const updated = filteredCachedClients.map(client => ({
                                ...client,
                                opportunities: opportunitiesByClient[client.id] || client.opportunities || []
                            }));
                            setClients(updated);
                            safeStorage.setClients(updated);
                        })
                        .catch(error => {
                            // Handle error gracefully - don't log for server errors (500s)
                            const isServerError = error?.message?.includes('500') || error?.message?.includes('Server error') || error?.message?.includes('Failed to list opportunities');
                            if (!isServerError) {
                                console.warn('⚠️ Failed to load opportunities in bulk from cache:', error.message || error);
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
            
            // If we have cached clients AND it's been less than 10 seconds since last call, skip API entirely
            // This prevents unnecessary network requests when data is fresh
            // UNLESS forceRefresh is true - then ALWAYS call API (bypass all throttling)
            if (!forceRefresh && timeSinceLastCall < API_CALL_INTERVAL && (clients.length > 0 || (cachedClients && cachedClients.length > 0))) {
                console.log(`⚡ Skipping API call (${(timeSinceLastCall / 1000).toFixed(1)}s since last call, cached data available)`);
                
                // But still trigger LiveDataSync in background to get updates
                if (window.LiveDataSync?.forceSync) {
                    console.log('🔄 Triggering background sync for fresh data...');
                    window.LiveDataSync.forceSync().catch(err => {
                        console.warn('⚠️ Background sync failed:', err);
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
                            const clientsToUpdate = clients.length > 0 ? clients : (cachedClients || []);
                            const updated = clientsToUpdate.map(client => ({
                                ...client,
                                opportunities: opportunitiesByClient[client.id] || client.opportunities || []
                            }));
                            setClients(updated);
                            safeStorage.setClients(updated);
                        })
                        .catch(error => {
                            // Handle error gracefully - don't log for server errors (500s)
                            const isServerError = error?.message?.includes('500') || error?.message?.includes('Server error') || error?.message?.includes('Failed to list opportunities');
                            if (!isServerError) {
                                console.warn('⚠️ Failed to refresh opportunities in background:', error.message || error);
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
                const apiMethod = window.DatabaseAPI?.getClients || window.api?.listClients;
                if (!apiMethod) {
                    console.warn('⚠️ No API method available for fetching clients');
                    return;
                }
                const res = await apiMethod();
                const apiEndTime = performance.now();
                console.log(`⚡ API call: ${(apiEndTime - apiStartTime).toFixed(1)}ms`);
                // DatabaseAPI returns { data: { clients: [...] } }, while api.listClients might return { data: { clients: [...] } }
                const apiClients = res?.data?.clients || res?.clients || [];
                console.log(`🔍 Raw API clients received: ${apiClients.length}`, apiClients);
                
                // If API returns no clients, use cached data
                if (apiClients.length === 0 && cachedClients && cachedClients.length > 0) {
                    return; // Keep showing cached data
                }
                
                // Use memoized data processor for better performance
                const processStartTime = performance.now();
                const processedClients = processClientData(apiClients);
                console.log(`🔍 Processed clients: ${processedClients.length}`, processedClients);
                
                // Separate clients and leads based on type
                // Include records with type='client' OR null/undefined (legacy clients without type field)
                const clientsOnly = processedClients.filter(c => c.type === 'client' || c.type === null || c.type === undefined);
                const leadsOnly = processedClients.filter(c => c.type === 'lead');
                // Log any records with unexpected types for debugging
                const unexpectedType = processedClients.filter(c => c.type && c.type !== 'client' && c.type !== 'lead');
                if (unexpectedType.length > 0) {
                    console.warn(`⚠️ Found ${unexpectedType.length} records with unexpected type:`, unexpectedType.map(c => ({ id: c.id, name: c.name, type: c.type })));
                }
                console.log(`🔍 Clients only: ${clientsOnly.length} (including ${processedClients.filter(c => c.type === null || c.type === undefined).length} legacy/null), Leads only: ${leadsOnly.length}`);
                
                // Preserve opportunities from cached clients for instant display
                const cachedClientsForOpps = safeStorage.getClients() || [];
                const clientsWithCachedOpps = clientsOnly.map(client => {
                    const cachedClient = cachedClientsForOpps.find(c => c.id === client.id);
                    if (cachedClient?.opportunities && Array.isArray(cachedClient.opportunities) && cachedClient.opportunities.length > 0) {
                        return { ...client, opportunities: cachedClient.opportunities };
                    }
                    return client;
                });
                
                // Show clients immediately with preserved opportunities
                setClients(clientsWithCachedOpps);
                
                // Only update leads if they're mixed with clients in the API response
                // (Leads typically come from a separate getLeads() endpoint via loadLeads())
                if (leadsOnly.length > 0) {
                    // API returned leads mixed with clients - use them
                    setLeads(leadsOnly);
                    setLeadsCount(leadsOnly.length);
                    // Save to localStorage
                    if (window.storage?.setLeads) {
                        window.storage.setLeads(leadsOnly);
                        console.log(`✅ Saved ${leadsOnly.length} leads from clients API to localStorage`);
                    }
                } else {
                    // No leads in clients API - preserve current leads state (from separate getLeads() call or cache)
                    // Don't overwrite leads here - let loadLeads() handle it
                    console.log('⚡ No leads in clients API response, preserving current leads state');
                }
                
                // Save clients with preserved opportunities to localStorage (instant display)
                safeStorage.setClients(clientsWithCachedOpps);
                
                // Load fresh opportunities from API in background (only if Pipeline is active)
                // Use bulk fetch instead of per-client calls for much better performance
                if (viewMode === 'pipeline' && window.DatabaseAPI?.getOpportunities) {
                    console.log('📡 Loading all opportunities in bulk (much faster than per-client calls)...');
                    window.DatabaseAPI.getOpportunities()
                        .then(oppResponse => {
                            const allOpportunities = oppResponse?.data?.opportunities || [];
                            console.log(`✅ Loaded ${allOpportunities.length} opportunities in bulk`);
                            
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
                            const updated = clientsOnly.map(client => ({
                                ...client,
                                opportunities: opportunitiesByClient[client.id] || []
                            }));
                            
                            const totalOpps = updated.reduce((sum, c) => sum + (c.opportunities?.length || 0), 0);
                            if (totalOpps > 0) {
                                console.log(`✅ Attached ${totalOpps} opportunities to ${clientsOnly.length} clients (bulk load)`);
                            }
                            setClients(updated);
                            safeStorage.setClients(updated);
                        })
                        .catch(error => {
                            // Handle error gracefully - don't log for server errors (500s)
                            const isServerError = error?.message?.includes('500') || error?.message?.includes('Server error') || error?.message?.includes('Failed to list opportunities');
                            if (!isServerError) {
                                console.warn('⚠️ Failed to load opportunities in bulk, falling back to cached opportunities:', error.message || error);
                            }
                            // Keep existing opportunities from cache
                        });
                }
                
                const loadEndTime = performance.now();
                console.log(`⚡ TOTAL loadClients: ${(loadEndTime - loadStartTime).toFixed(1)}ms`);
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
                console.warn('⚠️ No projects API available');
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
        // Load clients and projects immediately
        loadClients();
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
                    console.log(`⚡ Loading ${cachedLeads.length} leads from localStorage immediately`);
                    setLeads(cachedLeads);
                    setLeadsCount(cachedLeads.length);
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
                console.log('📡 Checking for leads updates from API (will skip if already cached)...');
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
        setTimeout(() => {
            if (leads.length === 0) {
                console.log('🔄 Retrying leads load from localStorage...');
                tryLoadLeadsFromStorage();
            }
        }, 1000);
    }, []);

    // Keep leadsCount in sync with leads.length
    useEffect(() => {
        setLeadsCount(leads.length);
    }, [leads.length]);

    // AUTOMATIC CACHE CLEARING: Clear all caches on mount to ensure fresh data across users
    useEffect(() => {
        console.log('🧹 AUTOMATIC: Clearing all caches on component mount to ensure fresh data...');
        
        // Clear ClientCache
        if (window.ClientCache?.clearCache) {
            window.ClientCache.clearCache();
            console.log('   ✅ ClientCache cleared');
        }
        
        // Clear DatabaseAPI cache
        if (window.DatabaseAPI?.clearCache) {
            window.DatabaseAPI.clearCache('/leads');
            window.DatabaseAPI.clearCache('/clients');
            console.log('   ✅ DatabaseAPI cache cleared');
        }
        
        // Clear localStorage to prevent stale data
        if (window.storage?.removeLeads) {
            window.storage.removeLeads();
            console.log('   ✅ localStorage leads cleared');
        }
        if (window.storage?.removeClients) {
            window.storage.removeClients();
            console.log('   ✅ localStorage clients cleared');
        }
        
        // Reset API call timestamps to force fresh fetch
        lastApiCallTimestamp = 0;
        lastLeadsApiCallTimestamp = 0;
        
        console.log('✅ All caches cleared - fresh data will be fetched automatically');
        
        // Trigger initial data load after clearing cache
        setTimeout(() => {
            if (viewMode === 'leads') {
                loadLeads(true);
            } else if (viewMode === 'clients') {
                loadClients(true);
            }
        }, 500);
    }, []); // Only run once on mount

    // Force refresh leads when switching to leads view to ensure fresh data across users
    // CRITICAL: Skip if user is editing
    useEffect(() => {
        if (viewMode === 'leads' && !isUserEditingRef.current) {
            const currentUser = window.storage?.getUser?.();
            const userEmail = currentUser?.email || 'unknown';
            console.log(`🔄 Switching to leads view (${userEmail}) - clearing caches and refreshing...`);
            
            // Clear all caches before loading
            if (window.ClientCache?.clearLeadsCache) {
                window.ClientCache.clearLeadsCache();
            }
            if (window.DatabaseAPI?.clearCache) {
                window.DatabaseAPI.clearCache('/leads');
            }
            if (window.storage?.removeLeads) {
                window.storage.removeLeads();
            }
            
            // Immediately refresh and trigger sync
            setTimeout(async () => {
                await loadLeads(true); // Force refresh to bypass cache and get latest leads
                
                // Also trigger LiveDataSync to ensure we have latest data
                if (window.LiveDataSync?.forceSync) {
                    window.LiveDataSync.forceSync().catch(err => {
                        console.warn('⚠️ Force sync failed (will sync automatically):', err);
                    });
                }
            }, 100);
        }
    }, [viewMode]);

    // Force refresh clients when switching to clients view to ensure fresh data across users
    // CRITICAL: Skip if user is editing
    useEffect(() => {
        if (viewMode === 'clients' && !isUserEditingRef.current) {
            const currentUser = window.storage?.getUser?.();
            const userEmail = currentUser?.email || 'unknown';
            console.log(`🔄 Switching to clients view (${userEmail}) - clearing caches and refreshing...`);
            
            // Clear all caches before loading
            if (window.ClientCache?.clearClientsCache) {
                window.ClientCache.clearClientsCache();
            }
            if (window.DatabaseAPI?.clearCache) {
                window.DatabaseAPI.clearCache('/clients');
            }
            if (window.storage?.removeClients) {
                window.storage.removeClients();
            }
            
            // Immediately refresh and trigger sync
            setTimeout(async () => {
                await loadClients(true); // Force refresh to bypass cache and get latest clients
                
                // Also trigger LiveDataSync to ensure we have latest data
                if (window.LiveDataSync?.forceSync) {
                    window.LiveDataSync.forceSync().catch(err => {
                        console.warn('⚠️ Force sync failed (will sync automatically):', err);
                    });
                }
            }, 100);
        }
    }, [viewMode]);

    // Ensure leads are loaded from localStorage if state is empty
    useEffect(() => {
        setLeads(prevLeads => {
            if (prevLeads.length === 0) {
                const cachedLeads = window.storage?.getLeads?.();
                if (cachedLeads && Array.isArray(cachedLeads) && cachedLeads.length > 0) {
                    console.log(`🔄 Restoring ${cachedLeads.length} leads from localStorage to state`);
                    setLeadsCount(cachedLeads.length);
                    return cachedLeads;
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
                const filteredClients = cachedClients.filter(c => c.type === 'client' || !c.type);
                if (filteredClients.length > 0) {
                    console.log(`🔄 Restoring ${filteredClients.length} clients from localStorage to state`);
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

            if (normalizedIdentity.generated) {
                console.warn('⚠️ mapDbClient: Entity missing primary identifier, generated fallback', {
                    type: isLead ? 'lead' : 'client',
                    name: c?.name || '(unnamed)',
                    fallbackId: normalizedId
                });
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
                        console.warn(`⚠️ Failed to parse ${fieldName} JSON:`, error?.message || error);
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
                        console.warn(`⚠️ Failed to parse ${fieldName} JSON:`, error?.message || error);
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
                sites: parseArrayField(c.sites, 'sites'),
                opportunities: parseArrayField(c.opportunities, 'opportunities'),
                contracts: parseArrayField(c.contracts, 'contracts'),
                activityLog: parseArrayField(c.activityLog, 'activityLog'),
                services: parseArrayField(c.services, 'services'),
                billingTerms: parseObjectField(c.billingTerms, 'billingTerms', {
                    paymentTerms: 'Net 30',
                    billingFrequency: 'Monthly',
                    currency: 'ZAR',
                    retainerAmount: 0,
                    taxExempt: false,
                    notes: ''
                }),
                ...(normalizedIdentity.generated ? { tempId: normalizedId, legacyId: c.id ?? c.clientId ?? null } : {}),
                createdAt: c.createdAt,
                updatedAt: c.updatedAt
            };
        };

        const subscriberId = 'clients-screen-live-sync';
        const handler = async (message) => {
            // CRITICAL: FIRST CHECK - If ANY form is open, completely ignore ALL messages
            if (isFormOpenRef.current) {
                console.log('🚫 LiveDataSync: BLOCKED - form is open (isFormOpenRef check)');
                return;
            }
            
            // CRITICAL: Ignore all messages if LiveDataSync is not running (stopped)
            if (window.LiveDataSync && !window.LiveDataSync.isRunning) {
                console.log('🚫 LiveDataSync: Ignoring message - LiveDataSync is stopped');
                return;
            }
            
            // CRITICAL: Skip LiveDataSync updates if user is editing OR auto-saving
            // Use REF for synchronous check (state might lag)
            if (isUserEditingRef.current || isAutoSavingRef.current) {
                console.log('⏸️ LiveDataSync: Skipping update - user is editing or auto-saving (editing:', isUserEditingRef.current, 'autoSaving:', isAutoSavingRef.current, ')');
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
                    console.log('🚫 LiveDataSync: BLOCKED - form is open (PRIMARY GUARD)', {
                        viewMode: currentViewMode,
                        isAddClientForm,
                        isAddLeadForm,
                        isDetailView,
                        selectedClient: selectedClientRef.current,
                        selectedLead: selectedLeadRef.current
                    });
                    return; // Ignore all updates when forms are open
                }
                
                if (message.dataType === 'clients') {
                    // Check if data changed to prevent unnecessary updates
                    const dataHash = JSON.stringify(message.data);
                    const now = Date.now();
                    
                    // Log incoming update
                    console.log(`📥 LiveDataSync: Received ${message.data.length} clients update`);
                    
                    if (dataHash === lastLiveDataClientsHash && (now - lastLiveDataSyncTime) < LIVE_SYNC_THROTTLE) {
                        console.log(`⚡ LiveDataSync: Skipping duplicate clients update (data unchanged)`);
                        return;
                    }
                    
                    // Filter to only include actual clients (exclude leads and null types)
                    const processed = message.data.map(mapDbClient).filter(c => c.type === 'client');
                    console.log(`📥 LiveDataSync: Processed ${processed.length} clients after filtering`);
                    
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
                            const clientsWithPreservedOpps = processed.map((client) => {
                                const existingOpps = opportunitiesByClientId[client.id] || [];
                                const signature = buildOpportunitiesSignature(existingOpps);
                                if (client?.id) {
                                    pipelineOpportunitiesLoadedRef.current.set(client.id, { signature });
                                }
                                return {
                                    ...client,
                                    opportunities: existingOpps
                                };
                            });
                            const totalPreservedOpps = clientsWithPreservedOpps.reduce((sum, c) => sum + (c.opportunities?.length || 0), 0);
                            if (totalPreservedOpps > 0) {
                                console.log(`📌 LiveDataSync: Preserved ${totalPreservedOpps} opportunities (pipeline, no fetch needed)`);
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
                                    return {
                                        ...client,
                                        opportunities: existingOpps
                                    };
                                }

                                hasChanges = true;
                                return {
                                    ...client,
                                    opportunities: effectiveOpps
                                };
                            });
                            const totalOpps = clientsWithOpportunities.reduce((sum, c) => sum + (c.opportunities?.length || 0), 0);
                            console.log(`✅ LiveDataSync: Loaded ${totalOpps} opportunities for ${clientsWithOpportunities.length} clients (bulk, viewMode: ${currentViewMode})`);
                            setClients(clientsWithOpportunities);
                            safeStorage.setClients(clientsWithOpportunities);
                        } catch (error) {
                            // Handle error gracefully - don't log for server errors (500s)
                            const isServerError = error?.message?.includes('500') || error?.message?.includes('Server error') || error?.message?.includes('Failed to list opportunities');
                            if (!isServerError) {
                                console.warn('⚠️ LiveDataSync: Failed to load opportunities in bulk, preserving existing opportunities:', error.message || error);
                            }
                            // Preserve existing opportunities even when API call fails
                            const clientsWithPreservedOpps = processed.map(client => ({
                                ...client,
                                opportunities: opportunitiesByClientId[client.id] || []
                            }));
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
                            console.log(`📌 LiveDataSync: Preserved ${totalPreservedOpps} opportunities (viewMode: ${currentViewMode})`);
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
                        console.log('🚫 LiveDataSync: BLOCKED leads update - lead modal is open', {
                            viewMode: currentViewMode,
                            isAddLeadForm,
                            isDetailView,
                            selectedLead: selectedLeadRef.current
                        });
                        return; // Don't update leads when modal is open
                    }
                    
                    const processedLeads = message.data.map(mapDbClient).filter(c => (c.type || 'lead') === 'lead');
                    console.log(`📥 LiveDataSync: Received ${processedLeads.length} leads update`);
                    setLeads(processedLeads);
                    setLeadsCount(processedLeads.length); // Update count when LiveDataSync updates
                    console.log(`✅ LiveDataSync: Updated leads count to ${processedLeads.length}`);
                    // Also update localStorage for consistency
                    if (window.storage?.setLeads) {
                        try {
                            window.storage.setLeads(processedLeads);
                        } catch (e) {
                            console.warn('⚠️ Failed to save LiveDataSync leads to localStorage:', e);
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
        console.log('🔍 Client Data Debug Report:');
        console.log('Current clients state:', clients.length, 'clients');
        console.log('Clients:', clients.map(c => ({ id: c.id, name: c.name, ownerId: c.ownerId })));
        
        const localStorageClients = safeStorage.getClients();
        console.log('localStorage clients:', localStorageClients ? localStorageClients.length : 'none');
        if (localStorageClients) {
            console.log('localStorage clients:', localStorageClients.map(c => ({ id: c.id, name: c.name, ownerId: c.ownerId })));
        }
        
        const cachedClients = window.ClientCache?.getClients();
        console.log('Cached clients:', cachedClients ? cachedClients.length : 'none');
        if (cachedClients) {
            console.log('Cached clients:', cachedClients.map(c => ({ id: c.id, name: c.name, ownerId: c.ownerId })));
        }
        
        const currentUser = window.storage?.getUser?.();
        console.log('Current user:', currentUser);
        
        console.log('Cache status:', window.ClientCache?.getCacheStatus?.());
    };

    // Make debug function available globally
    window.debugClientData = debugClientData;

    // Load leads from database only
    const loadLeads = async (forceRefresh = false) => {
        // Prevent concurrent calls
        if (isLeadsLoading) {
            console.log('⏸️ loadLeads already in progress, skipping duplicate call');
            return;
        }
        
        try {
            isLeadsLoading = true;
            console.log('🔍 loadLeads() called, forceRefresh:', forceRefresh, 'current leads.length:', leads.length);
            
            // Even for force refresh, respect minimum interval to prevent rate limiting
            if (forceRefresh) {
                const now = Date.now();
                const timeSinceLastCall = now - lastLeadsApiCallTimestamp;
                if (timeSinceLastCall < FORCE_REFRESH_MIN_INTERVAL) {
                    console.log(`⏸️ Force refresh throttled (${(timeSinceLastCall / 1000).toFixed(1)}s since last call, min ${FORCE_REFRESH_MIN_INTERVAL / 1000}s)`);
                    // Wait for the remaining time
                    await new Promise(resolve => setTimeout(resolve, FORCE_REFRESH_MIN_INTERVAL - timeSinceLastCall));
                }
            }
            
            // Check localStorage first to avoid unnecessary API calls if data is already loaded
            if (!forceRefresh) {
                const cachedLeads = window.storage?.getLeads?.();
                
                // If we have leads in localStorage but state is empty, load them immediately
                if (cachedLeads && Array.isArray(cachedLeads) && cachedLeads.length > 0 && leads.length === 0) {
                    console.log(`⚡ Leads already in localStorage (${cachedLeads.length} leads), loading into state`);
                    // Use functional setState to ensure it updates even if leads is empty
                    setLeads(prevLeads => {
                        if (prevLeads.length === 0) {
                            return cachedLeads;
                        }
                        return prevLeads;
                    });
                    setLeadsCount(cachedLeads.length);
                }
                
                const now = Date.now();
                const timeSinceLastCall = now - lastLeadsApiCallTimestamp;
                
                // Check if we should skip API call:
                // 1. If we have leads in state AND recent API call - skip
                // 2. If we have leads in localStorage (just loaded above) AND recent API call - skip
                // UNLESS forceRefresh is true - then ALWAYS call API
                const hasLeadsInState = leads.length > 0;
                const hasLeadsInCache = cachedLeads && Array.isArray(cachedLeads) && cachedLeads.length > 0;
                
                if (!forceRefresh && timeSinceLastCall < API_CALL_INTERVAL && (hasLeadsInState || hasLeadsInCache)) {
                    const leadCount = hasLeadsInState ? leads.length : cachedLeads.length;
                    console.log(`⚡ Skipping leads API call (${(timeSinceLastCall / 1000).toFixed(1)}s since last call, ${leadCount} leads already loaded)`);
                    
                    // But still trigger LiveDataSync in background to get updates
                    if (window.LiveDataSync?.forceSync) {
                        console.log('🔄 Triggering background sync for fresh leads...');
                        window.LiveDataSync.forceSync().catch(err => {
                            console.warn('⚠️ Background sync failed:', err);
                        });
                    }
                    return; // Use cached data, skip API call
                }
            } else {
                // Force refresh - clear all caches and bypass timestamp check
                console.log('🔄 FORCE REFRESH: Resetting API call timestamp to bypass cache');
                if (window.dataManager?.invalidate) {
                    window.dataManager.invalidate('leads');
                    console.log('🗑️ Cache invalidated for leads');
                }
                // Clear DatabaseAPI cache
                if (window.DatabaseAPI?.clearCache) {
                    window.DatabaseAPI.clearCache('/leads');
                }
                // Clear localStorage cache to ensure fresh data
                if (window.storage?.removeLeads) {
                    window.storage.removeLeads();
                    console.log('🗑️ localStorage cache cleared for leads');
                }
                lastLeadsApiCallTimestamp = 0; // Reset to force API call
            }
            
            const token = window.storage?.getToken?.();
            const hasApi = window.api && typeof window.api.getLeads === 'function';
            
            // Skip if not authenticated or API not ready
            if (!token || !hasApi) {
                isLeadsLoading = false;
                return;
            }
            
            if (forceRefresh) {
                console.log('🔍 Loading leads from API... (FORCED REFRESH - bypassing all caches)');
            }
            
            // Use DatabaseAPI.getLeads if available (supports forceRefresh), otherwise fall back to api.getLeads
            // CRITICAL: Bind the method to preserve 'this' context, or call it directly on the object
            let apiResponse;
            if (window.DatabaseAPI?.getLeads) {
                console.log('📡 Calling DatabaseAPI.getLeads API...');
                apiResponse = await window.DatabaseAPI.getLeads(forceRefresh);
            } else if (window.api?.getLeads) {
                console.log('📡 Calling api.getLeads API...');
                apiResponse = await window.api.getLeads();
            } else {
                console.warn('⚠️ No API method available for fetching leads');
                return;
            }
            const rawLeads = apiResponse?.data?.leads || apiResponse?.leads || [];
            console.log(`📥 Received ${rawLeads.length} leads from API`);
            
            // DEBUG: Log lead details and ownerIds for visibility debugging
            const currentUser = window.storage?.getUser?.();
            const userEmail = currentUser?.email || 'unknown';
            console.log(`📥 Received ${rawLeads.length} leads from API for ${userEmail}`);
            
            if (rawLeads.length > 0) {
                console.log(`🔍 Leads received for ${userEmail}:`, rawLeads.map(l => ({ 
                    id: l.id, 
                    name: l.name, 
                    ownerId: l.ownerId || 'null',
                    type: l.type,
                    stage: l.stage,
                    hasStage: l.stage !== undefined && l.stage !== null
                })));
                
                // Log ReitCoal specifically to verify stage field
                const reitcoulLead = rawLeads.find(l => l.name && l.name.toLowerCase().includes('reit'));
                if (reitcoulLead) {
                    console.log(`🎯 ReitCoal in raw API response:`, { 
                        name: reitcoulLead.name, 
                        stage: reitcoulLead.stage, 
                        stageType: typeof reitcoulLead.stage,
                        allKeys: Object.keys(reitcoulLead).slice(0, 20)
                    });
                }
                
                // Log specific lead IDs to help debug missing leads
                const leadIds = rawLeads.map(l => l.id).sort();
                console.log(`📋 Lead IDs for ${userEmail} (${leadIds.length} total):`, leadIds);
            } else {
                console.warn(`⚠️ WARNING: API returned 0 leads for ${userEmail}. This might indicate a visibility issue.`);
            }
            
            // Map database fields to UI expected format with JSON parsing
            const mappedLeads = rawLeads.map(lead => {
                const normalized = normalizeEntityId(lead, 'lead');
                const normalizedId = String(normalized.id);

                if (normalized.generated) {
                    console.warn('⚠️ loadLeads: Lead missing primary identifier, generated fallback ID', {
                        leadName: lead?.name || '(unnamed lead)',
                        createdAt: lead?.createdAt,
                        fallbackId: normalizedId
                    });
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
                    stage: lead.stage || 'Awareness',
                    source: lead.source || 'Website',
                    value: lead.value || lead.revenue || 0,
                    probability: lead.probability || 0,
                    isStarred: lead.isStarred === true,
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
                    tags: Array.isArray(lead.tags) ? lead.tags.map(t => t.tag || t).filter(Boolean) : [],
                    type: lead.type || 'lead',
                    ownerId: lead.ownerId || null,
                    createdAt: lead.createdAt,
                    updatedAt: lead.updatedAt
                };
            });
                
            setLeads(mappedLeads);
            setLeadsCount(mappedLeads.length); // Update count badge immediately
            
            // Log count update for debugging
            console.log(`✅ Updated leads count for ${userEmail}: ${mappedLeads.length} leads (was ${leads.length})`);
            
            // Persist leads to localStorage for fast loading on next boot
            if (window.storage?.setLeads) {
                try {
                    window.storage.setLeads(mappedLeads);
                    console.log(`💾 Saved ${mappedLeads.length} leads to localStorage for ${userEmail}`);
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
                console.log(`✅ Force refresh complete for ${userEmail}: ${mappedLeads.length} total leads (${Object.entries(statusCounts).map(([status, count]) => `${count} ${status}`).join(', ')})`);
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
    
    // Save data
    useEffect(() => {
        safeStorage.setClients(clients);
    }, [clients]);

    useEffect(() => {
        if (!Array.isArray(clients) || clients.length === 0) {
            pipelineOpportunitiesLoadedRef.current.clear();
        }
    }, [clients]);
    
    // Leads are now database-only, no localStorage sync needed

    const handleClientModalClose = async () => {
        setViewMode('clients');
        setEditingClientId(null);
        selectedClientRef.current = null;
        isFormOpenRef.current = false;
        setCurrentTab('overview');
        // Refresh data from server
        await loadClients(true);
        startSync();
    };

    const handleLeadModalClose = async () => {
        let returnToPipeline = false;
        try {
            returnToPipeline = sessionStorage.getItem('returnToPipeline') === 'true';
        } catch (error) {
            console.warn('⚠️ Clients: Unable to read returnToPipeline flag on lead modal close', error);
        }
        if (returnToPipeline) {
            try {
                sessionStorage.removeItem('returnToPipeline');
            } catch (error) {
                console.warn('⚠️ Clients: Unable to clear returnToPipeline flag on lead modal close', error);
            }
            setViewMode('pipeline');
        } else {
            setViewMode('leads');
        }
        setEditingLeadId(null);
        selectedLeadRef.current = null;
        isFormOpenRef.current = false;
        setCurrentLeadTab('overview');
        // Refresh data from server
        await loadLeads(true);
        startSync();
    };
    
    const handlePauseSync = (pause) => {
        isFormOpenRef.current = pause;
        console.log(`⏸️ handlePauseSync: ${pause ? 'pausing' : 'resuming'} LiveDataSync`);
    };
    
    const handleSaveClient = async (clientFormData, stayInEditMode = false) => {
        console.log('=== SAVE CLIENT DEBUG ===');
        console.log('Received form data:', clientFormData);
        console.log('All fields:', Object.keys(clientFormData));
        console.log('Contacts in form data:', clientFormData.contacts);
        console.log('Sites in form data:', clientFormData.sites);
        
        // Validate required fields
        if (!clientFormData || !clientFormData.name || clientFormData.name.trim() === '') {
            console.error('❌ Client name is required but empty');
            alert('Please enter a Client Name to save the client.');
            return;
        }
        
        // Get selectedClient from editingClientId
        const selectedClient = editingClientId ? clients.find(c => c.id === editingClientId) : null;
        console.log('Selected client:', selectedClient);
        
        // Declare comprehensiveClient outside try block so it's available in catch
        let comprehensiveClient = null;
        
        try {
            // Check if user is logged in
            const token = window.storage?.getToken?.() || null;
            
            // Create comprehensive client object with ALL fields
            comprehensiveClient = {
                id: selectedClient ? selectedClient.id : Date.now().toString(),
                name: clientFormData.name || '',
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
                }
            };
            
            console.log('📝 Comprehensive client created:', comprehensiveClient);
            console.log('📝 Contacts in comprehensive client:', comprehensiveClient.contacts);
            console.log('📝 Sites in comprehensive client:', comprehensiveClient.sites);
            console.log('📝 Opportunities in comprehensive client:', comprehensiveClient.opportunities);
            console.log('📝 Services in comprehensive client:', comprehensiveClient.services);
            
            // Don't save to localStorage YET - wait for API to succeed
            // This ensures database is the source of truth
            console.log('Preparing to save client with all fields:', comprehensiveClient);
            
            let apiResponse = null; // Declare outside if/else so we can use it for return value
            
            if (!token) {
                // No token, save to localStorage only
                console.log('No token, saving to localStorage only');
                    if (selectedClient) {
                        const updated = clients.map(c => c.id === selectedClient.id ? comprehensiveClient : c);
                        setClients(updated);
                        safeStorage.setClients(updated);
                        // CRITICAL: Always use comprehensiveClient (which has latest notes) instead of API response
                        // This ensures notes typed by user are never lost
                        selectedClientRef.current = comprehensiveClient; // Update ref with comprehensiveClient (has latest notes)
                        console.log('✅ Updated client in localStorage, new count:', updated.length);
                        console.log('📝 Notes in comprehensiveClient:', comprehensiveClient.notes?.substring(0, 50) || 'none');
                    } else {
                        const newClients = [...clients, comprehensiveClient];
                        setClients(newClients);
                        safeStorage.setClients(newClients);
                        selectedClientRef.current = comprehensiveClient; // Update ref to show new data
                        console.log('✅ Added new client to localStorage, new count:', newClients.length);
                    }
                    // Return comprehensiveClient (has latest notes) for localStorage-only saves
                    return comprehensiveClient;
            } else {
                // Use API - database is source of truth
                try {
                    console.log('🔧 About to call API with selectedClient ID:', selectedClient?.id);
                    console.log('🔧 comprehensiveClient ID:', comprehensiveClient.id);
                    
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
                            billingTerms: comprehensiveClient.billingTerms
                        };
                        
                        console.log('🚀 Calling updateClient API with ID:', selectedClient.id);
                        console.log('📦 Update data payload:', JSON.stringify(apiUpdateData, null, 2));
                        console.log('📝 Notes being sent:', apiUpdateData.notes?.substring(0, 50) || 'empty');
                        console.log('📝 Services being sent:', apiUpdateData.services);
                        try {
                            apiResponse = await window.api.updateClient(selectedClient.id, apiUpdateData);
                            console.log('✅ Client updated via API with ALL data');
                            console.log('📥 API Response:', apiResponse);
                            console.log('📝 Notes in API response:', apiResponse?.data?.client?.notes?.substring(0, 50) || apiResponse?.client?.notes?.substring(0, 50) || 'none');
                            
                            // Clear caches in background (non-blocking)
                            Promise.all([
                                window.ClientCache?.clearCache?.(),
                                window.DatabaseAPI?.clearCache?.('/clients')
                            ]).catch(() => {});
                            
                            // Trigger background sync (non-blocking)
                            window.LiveDataSync?.forceSync?.().catch(() => {});
                        } catch (apiCallError) {
                            console.error('❌ API call failed with error:', apiCallError);
                            console.error('Error details:', apiCallError.message);
                            throw apiCallError; // Re-throw to be caught by outer catch
                        }
                    } else {
                        // For new clients, send ALL comprehensive data to API
                        const apiCreateData = {
                            name: comprehensiveClient.name,
                            type: comprehensiveClient.type || 'client',
                            industry: comprehensiveClient.industry,
                            status: comprehensiveClient.status === 'Active' ? 'active' : 'inactive',
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
                            // opportunities field removed - conflicts with Prisma relation
                            contracts: comprehensiveClient.contracts,
                            activityLog: comprehensiveClient.activityLog,
                            services: comprehensiveClient.services,
                            billingTerms: comprehensiveClient.billingTerms
                        };
                        
                        console.log('🚀 Creating client via API:', apiCreateData);
                        apiResponse = await window.api.createClient(apiCreateData);
                        console.log('✅ Client created via API:', apiResponse);
                        
                        // Update comprehensive client with API response
                        if (apiResponse?.data?.client?.id) {
                            comprehensiveClient.id = apiResponse.data.client.id;
                            console.log('✅ Updated client ID from API:', comprehensiveClient.id);
                        } else {
                            console.error('❌ No client ID in API response!');
                            console.log('Full API response:', apiResponse);
                        }
                        
                        // Trigger immediate LiveDataSync to ensure all users see the new client
                        // Also immediately refresh clients list to show new client without waiting for sync
                        console.log('🔄 Triggering immediate sync and refresh for all users...');
                        
                        // Batch cache clearing operations (non-blocking, don't wait)
                        Promise.all([
                            window.ClientCache?.clearCache?.(),
                            window.DatabaseAPI?.clearCache?.('/clients'),
                            window.DatabaseAPI?.clearCache?.('/leads'),
                            window.dataManager?.invalidate?.('clients')
                        ]).catch(() => {}); // Ignore errors, these are non-critical
                        
                        // Trigger background refresh and sync (non-blocking)
                        // Use requestIdleCallback or setTimeout(0) to avoid blocking the UI
                        (window.requestIdleCallback || setTimeout)(async () => {
                            await loadClients(true).catch(() => {}); // Force refresh
                            window.LiveDataSync?.forceSync?.().catch(() => {}); // Background sync
                        }, 0);
                    }
                    
                    // Prepare saved client with merged data from API response and comprehensiveClient
                    // CRITICAL: Always merge notes from comprehensiveClient to ensure latest typed notes are preserved
                    const savedClient = apiResponse?.data?.client || apiResponse?.client || comprehensiveClient;
                    if (savedClient && comprehensiveClient.notes !== undefined && comprehensiveClient.notes !== null) {
                        savedClient.notes = comprehensiveClient.notes;
                    }
                    // Merge all comprehensiveClient data to ensure nothing is lost
                    const finalClient = { ...savedClient, ...comprehensiveClient };
                    
                    // Batch all state updates together to prevent multiple renders
                    if (selectedClient) {
                        const updated = clients.map(c => c.id === selectedClient.id ? finalClient : c);
                        if (updated.length !== clients.length) {
                            console.error('❌ CRITICAL: Client count changed during API update!');
                            return;
                        }
                        // Single batched update - React 18+ will batch these automatically
                        setClients(updated);
                        safeStorage.setClients(updated);
                        selectedClientRef.current = finalClient; // Update ref immediately (no delay needed)
                    } else {
                        const newClients = [...clients, finalClient];
                        if (newClients.length !== clients.length + 1) {
                            console.error('❌ CRITICAL: Client count not increased by 1 during API add!');
                            return;
                        }
                        // Single batched update
                        setClients(newClients);
                        safeStorage.setClients(newClients);
                        selectedClientRef.current = finalClient; // Update ref immediately
                    }
                    
                } catch (apiError) {
                    console.error('API error saving client:', apiError);
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
                        console.log('Token expired, falling back to localStorage only');
                        window.storage?.removeToken?.();
                        window.storage?.removeUser?.();
                    }
                    
                    // For other errors, show the error message but still allow fallback
                    if (!errorMessage.includes('name required') && !errorMessage.includes('duplicate')) {
                        alert(`Error saving client: ${errorMessage}\n\nAttempting to save locally...`);
                    }
                    
                    // Always fall back to localStorage on any API error (except validation errors)
                    console.log('Falling back to localStorage for client save');
                    console.log('Current clients before fallback:', clients.length);
                    console.log('Comprehensive client to save:', comprehensiveClient);
                    
                    if (selectedClient) {
                        const updated = clients.map(c => c.id === selectedClient.id ? comprehensiveClient : c);
                        setClients(updated);
                        safeStorage.setClients(updated);
                        selectedClientRef.current = comprehensiveClient; // Update ref to show new data
                        console.log('✅ Updated client in localStorage, new count:', updated.length);
                    } else {
                        const newClients = [...clients, comprehensiveClient];
                        setClients(newClients);
                        safeStorage.setClients(newClients);
                        selectedClientRef.current = comprehensiveClient; // Update ref to show new data
                        console.log('✅ Added new client to localStorage, new count:', newClients.length);
                    }
                    console.log('✅ Fallback: Client saved to localStorage only');
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
        console.log('=== SAVE LEAD DEBUG ===');
        console.log('Received lead data:', leadFormData);
        console.log('Lead status from form:', leadFormData.status);
        console.log('Lead stage from form:', leadFormData.stage);
        
        // Validate required fields
        if (!leadFormData || !leadFormData.name || leadFormData.name.trim() === '') {
            console.error('❌ Lead name is required but empty');
            alert('Please enter an Entity Name to save the lead.');
            return;
        }
        
        // Get selectedLead from editingLeadId
        const selectedLead = editingLeadId && Array.isArray(leads) ? leads.find(l => l.id === editingLeadId) : null;
        console.log('Selected lead:', selectedLead);
        
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
                    stage: leadFormData.stage,
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
                    services: Array.isArray(leadFormData.services) ? leadFormData.services : (selectedLead.services || [])
                };
                
                console.log('🔄 Updated lead object:', { 
                    id: updatedLead.id, 
                    status: updatedLead.status, 
                    stage: updatedLead.stage,
                    contactsCount: Array.isArray(updatedLead.contacts) ? updatedLead.contacts.length : 0,
                    followUpsCount: Array.isArray(updatedLead.followUps) ? updatedLead.followUps.length : 0,
                    hasNotes: !!updatedLead.notes,
                    commentsCount: Array.isArray(updatedLead.comments) ? updatedLead.comments.length : 0,
                    proposalsCount: Array.isArray(updatedLead.proposals) ? updatedLead.proposals.length : 0
                });
                
                if (token && window.api?.updateLead) {
                    try {
                        console.log('🌐 Calling API to update lead:', updatedLead.id);
                        console.log('🌐 Payload includes - stage:', updatedLead.stage, '(type:', typeof updatedLead.stage, ')',
                                   'contacts:', Array.isArray(updatedLead.contacts) ? updatedLead.contacts.length : 'not array', 
                                   'followUps:', Array.isArray(updatedLead.followUps) ? updatedLead.followUps.length : 'not array',
                                   'proposals:', Array.isArray(updatedLead.proposals) ? updatedLead.proposals.length : 'not array',
                                   'notes length:', updatedLead.notes ? updatedLead.notes.length : 0);
                        console.log('🌐 Proposals being sent:', updatedLead.proposals ? JSON.stringify(updatedLead.proposals, null, 2) : 'NO PROPOSALS');
                        
                        const apiResponse = await window.api.updateLead(updatedLead.id, updatedLead);
                        console.log('✅ Lead updated in database');
                        console.log('✅ API response:', apiResponse);
                        
                        // Clear all caches to ensure updates appear immediately
                        if (window.ClientCache?.clearCache) {
                            window.ClientCache.clearCache();
                        }
                        if (window.DatabaseAPI?.clearCache) {
                            window.DatabaseAPI.clearCache('/leads');
                        }
                        
                        // Trigger immediate LiveDataSync to ensure all users see the change
                        if (window.LiveDataSync?.forceSync) {
                            console.log('🔄 Triggering immediate sync for all users...');
                            window.LiveDataSync.forceSync().catch(err => {
                                console.warn('⚠️ Force sync failed (will sync automatically):', err);
                            });
                        }
                        console.log('✅ API response structure:', {
                            hasData: !!apiResponse?.data,
                            hasLead: !!apiResponse?.data?.lead,
                            hasDirectLead: !!apiResponse?.lead,
                            dataKeys: apiResponse?.data ? Object.keys(apiResponse.data) : [],
                            responseKeys: apiResponse ? Object.keys(apiResponse) : []
                        });
                        
                        // Extract the saved lead from API response - try multiple possible locations
                        let savedLead = apiResponse?.data?.lead || apiResponse?.lead || apiResponse?.data || updatedLead;
                        
                        // If we got the same object back, log a warning
                        if (savedLead === updatedLead && savedLead.id === updatedLead.id) {
                            console.warn('⚠️ API response might not contain updated lead, using optimistic update');
                        } else {
                            console.log('✅ Extracted saved lead from API response:', savedLead.id);
                        }
                        
                        // Safe JSON parser helper
                        const safeParseJSON = (value, defaultValue) => {
                            if (typeof value !== 'string') return value || defaultValue;
                            try {
                                return JSON.parse(value || JSON.stringify(defaultValue));
                            } catch (e) {
                                console.warn('⚠️ Failed to parse JSON field, using default:', e);
                                return defaultValue;
                            }
                        };
                        
                        // Parse JSON fields from database (they come as strings)
                        savedLead = {
                            ...savedLead,
                            stage: savedLead.stage || updatedLead.stage || 'Awareness', // Ensure stage is preserved
                            status: savedLead.status || updatedLead.status || 'active', // Ensure status is preserved
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
                        
                        console.log('✅ Parsed saved lead - stage:', savedLead.stage, 'status:', savedLead.status);
                        console.log('📋 Proposals preserved:', {
                            fromFormData: Array.isArray(leadFormData.proposals) ? leadFormData.proposals.length : 0,
                            fromAPI: Array.isArray(savedLead.proposals) ? savedLead.proposals.length : 0,
                            final: Array.isArray(savedLead.proposals) ? savedLead.proposals.length : 0,
                            proposalIds: savedLead.proposals.map(p => p?.id)
                        });
                        
                        // CRITICAL: Use the API response to update state, not optimistic updates
                        // This ensures we're synced with the database
                        const savedLeads = leads.map(l => l.id === savedLead.id ? savedLead : l);
                        setLeads(savedLeads);
                        selectedLeadRef.current = savedLead; // Update selected lead ref with persisted data
                        
                        // Also update localStorage to keep cache in sync
                        if (window.storage?.setLeads) {
                            window.storage.setLeads(savedLeads);
                            console.log('💾 Updated leads in localStorage with saved data');
                        }
                        
                        // Invalidate API cache to ensure next load is fresh
                        if (window.DatabaseAPI?.clearCache) {
                            window.DatabaseAPI.clearCache('/leads');
                            console.log('🗑️ Cleared API cache for leads');
                        }
                        
                        console.log('✅ Saved lead data from API:', {
                            contacts: Array.isArray(savedLead.contacts) ? savedLead.contacts.length : 'not array',
                            followUps: Array.isArray(savedLead.followUps) ? savedLead.followUps.length : 'not array',
                            notes: savedLead.notes ? savedLead.notes.length : 0,
                            comments: Array.isArray(savedLead.comments) ? savedLead.comments.length : 'not array'
                        });
                    } catch (apiError) {
                        console.error('❌ API error updating lead:', apiError);
                        // If API fails, still update local state but show warning
                        const updatedLeads = leads.map(l => l.id === selectedLead.id ? updatedLead : l);
                        setLeads(updatedLeads);
                        selectedLeadRef.current = updatedLead; // Update ref with updated lead
                        
                        // Save to localStorage even when API fails
                        if (window.storage?.setLeads) {
                            try {
                                window.storage.setLeads(updatedLeads);
                                console.log('💾 Saved updated lead to localStorage (API error fallback)');
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
                            console.log('💾 Saved updated lead to localStorage (no auth)');
                        } catch (e) {
                            console.warn('⚠️ Failed to save lead to localStorage:', e);
                        }
                    }
                    
                    console.log('✅ Lead updated locally (no authentication)');
                }
                console.log('✅ Lead updated');
            } else {
                // Validate name for new leads
                if (!leadFormData.name || leadFormData.name.trim() === '') {
                    console.error('❌ Cannot create lead without a name');
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
                
                const newLead = {
                    ...leadFormData,
                    name: leadFormData.name.trim(), // Ensure name is trimmed
                    id: Date.now().toString(), // Generate local ID
                    type: 'lead', // Ensure it's marked as a lead
                    lastContact: new Date().toISOString().split('T')[0],
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
                        console.log('🌐 Calling API to create lead:', newLead);
                        const apiResponse = await window.api.createLead(newLead);
                        console.log('📥 API response received:', apiResponse);
                        console.log('📥 API response structure:', {
                            hasData: !!apiResponse?.data,
                            hasLead: !!apiResponse?.data?.lead,
                            hasDirectLead: !!apiResponse?.lead,
                            dataKeys: apiResponse?.data ? Object.keys(apiResponse.data) : [],
                            responseKeys: apiResponse ? Object.keys(apiResponse) : []
                        });
                        
                        // Extract lead from response - API returns { data: { lead: {...} } }
                        let savedLead = apiResponse?.data?.lead || apiResponse?.lead || apiResponse?.data || null;
                        
                        // If savedLead is still null or doesn't have an id, log warning
                        if (!savedLead || !savedLead.id) {
                            console.error('❌ CRITICAL: API response does not contain a valid lead with ID!');
                            console.error('❌ Full API response:', JSON.stringify(apiResponse, null, 2));
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
                        
                        console.log('✅ Lead created in database:', savedLead);
                        
                        // CRITICAL: Clear all caches to ensure new lead appears immediately
                        // Clear ClientCache
                        if (window.ClientCache?.clearCache) {
                            window.ClientCache.clearCache();
                            console.log('🗑️ Cleared ClientCache after lead save');
                        }
                        
                        // Clear DatabaseAPI cache
                        if (window.DatabaseAPI?.clearCache) {
                            window.DatabaseAPI.clearCache('/leads');
                            window.DatabaseAPI.clearCache('/clients'); // Also clear clients since they're related
                            console.log('🗑️ Cleared DatabaseAPI cache after lead save');
                        }
                        
                        // Clear localStorage to prevent stale data
                        if (window.storage?.removeLeads) {
                            window.storage.removeLeads();
                            console.log('🗑️ Cleared localStorage leads after lead save');
                        }
                        if (window.storage?.removeClients) {
                            window.storage.removeClients();
                            console.log('🗑️ Cleared localStorage clients after lead save');
                        }
                        
                        // Clear localStorage cache timestamp to force refresh
                        if (window.dataManager?.invalidate) {
                            window.dataManager.invalidate('leads');
                            console.log('🗑️ Invalidated dataManager cache for leads');
                        }
                        
                        // Trigger immediate LiveDataSync to ensure all users see the new lead
                        // Also immediately refresh leads list to show new lead without waiting for sync
                        console.log('🔄 Triggering immediate sync and refresh for all users...');
                        setTimeout(async () => {
                            // First, force refresh leads immediately
                            await loadLeads(true); // Force refresh bypasses cache
                            
                            // Then trigger sync for other users
                            if (window.LiveDataSync?.forceSync) {
                                window.LiveDataSync.forceSync().catch(err => {
                                    console.warn('⚠️ Force sync failed (will sync automatically):', err);
                                });
                            }
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
                            setLeadsCount(updatedLeads.length); // Update count immediately
                            
                            // CRITICAL: If modal is still open (stayInEditMode), update selectedLead with preserved data
                            // This ensures the modal receives the lead with user input preserved, not blank values
                            // For new leads, selectedLead is null initially, but after save we need to update it
                            // if we're staying in edit mode OR if the modal is still open
                            if (viewMode === 'lead-detail') {
                                // Update selectedLead with preserved data so modal can continue showing user's input
                                console.log('🔄 Updating selectedLead with preserved user input for new lead', {
                                    leadId: parsedSavedLead.id,
                                    name: parsedSavedLead.name,
                                    notes: parsedSavedLead.notes?.substring(0, 20)
                                });
                                selectedLeadRef.current = parsedSavedLead; // Update ref with parsed saved lead
                                
                                // CRITICAL: Update editingLeadId when creating a new lead with stayInEditMode=true
                                // This ensures the modal re-renders with the new leadId and can continue working properly
                                if (stayInEditMode && parsedSavedLead.id) {
                                    console.log('🔄 Updating editingLeadId to new lead ID:', parsedSavedLead.id);
                                    setEditingLeadId(parsedSavedLead.id);
                                }
                            }
                            
                            // CRITICAL: Save to localStorage immediately to ensure persistence
                            if (window.storage?.setLeads) {
                                try {
                                    window.storage.setLeads(updatedLeads);
                                    console.log('✅ Saved new lead to localStorage for persistence');
                                } catch (e) {
                                    console.warn('⚠️ Failed to save lead to localStorage:', e);
                                }
                            }
                            
                            console.log('✅ New lead created and saved to database');
                        } else {
                            // Fallback to local lead if API doesn't return proper response
                            const updatedLeads = [...leads, newLead];
                            setLeads(updatedLeads);
                            setLeadsCount(updatedLeads.length); // Update count immediately
                            
                            // Save to localStorage even in fallback case
                            if (window.storage?.setLeads) {
                                try {
                                    window.storage.setLeads(updatedLeads);
                                    console.log('✅ Saved new lead to localStorage (fallback)');
                                } catch (e) {
                                    console.warn('⚠️ Failed to save lead to localStorage:', e);
                                }
                            }
                            
                            console.log('✅ New lead created locally (API fallback)');
                        }
                    } catch (apiError) {
                        console.error('❌ API error creating lead:', apiError);
                        const errorMessage = apiError?.message || apiError?.response?.data?.error || 'Unknown error';
                        console.error('❌ Full API error details:', {
                            message: apiError.message,
                            response: apiError.response,
                            data: apiError.response?.data,
                            status: apiError.response?.status
                        });
                        
                        // Check if it's a validation error
                        if (errorMessage.includes('name required') || errorMessage.includes('name is required')) {
                            alert('Error: Lead name is required. Please make sure the Entity Name field is filled in.');
                            return; // Don't fallback to local creation for validation errors
                        }
                        
                        // For other errors, fallback to local creation
                        alert(`Warning: Could not save lead to server (${errorMessage}). Saved locally only.`);
                        const updatedLeads = [...leads, newLead];
                        setLeads(updatedLeads);
                        setLeadsCount(updatedLeads.length); // Update count immediately
                        
                        // Save to localStorage even in error fallback case
                        if (window.storage?.setLeads) {
                            try {
                                window.storage.setLeads(updatedLeads);
                                console.log('✅ Saved new lead to localStorage (error fallback)');
                            } catch (e) {
                                console.warn('⚠️ Failed to save lead to localStorage:', e);
                            }
                        }
                        
                        console.log('✅ New lead created locally (API fallback)');
                    }
                } else {
                    // No token or API, create locally only
                    console.log('⚠️ No authentication token - saving lead locally only');
                    const updatedLeads = [...leads, newLead];
                    setLeads(updatedLeads);
                    setLeadsCount(updatedLeads.length); // Update count immediately
                    
                    // Save to localStorage even without authentication
                    if (window.storage?.setLeads) {
                        try {
                            window.storage.setLeads(updatedLeads);
                            console.log('✅ Saved new lead to localStorage (no auth)');
                        } catch (e) {
                            console.warn('⚠️ Failed to save lead to localStorage:', e);
                        }
                    }
                    
                    console.log('✅ New lead created locally (no authentication)');
                }
                
                // For new leads, redirect to main leads view to show the newly added lead
                // Only if not staying in edit mode
                if (!stayInEditMode) {
                    setViewMode('leads');
                    selectedLeadRef.current = null; // Clear selected lead ref
                    setCurrentLeadTab('overview');
                    // CRITICAL: Restart LiveDataSync ONLY when form explicitly closes after save
                    handlePauseSync(false);
                    if (window.LiveDataSync && window.LiveDataSync.start) {
                        window.LiveDataSync.start();
                        console.log('▶️ LeadDetailModal saved - restarting LiveDataSync');
                    }
                    
                    // Force a refresh to ensure API data is loaded (if authenticated)
                    if (token) {
                        setTimeout(() => {
                            console.log('🔄 Refreshing leads after creation...');
                            loadLeads(true); // Force refresh to bypass API throttling
                        }, 100);
                    }
                }
            }
        } catch (error) {
            console.error('❌ Error saving lead:', error);
            const errorMessage = error?.message || 'Unknown error';
            console.error('❌ Full error details:', error);
            alert(`Failed to save lead: ${errorMessage}\n\nCheck the browser console for more details.`);
        }
    };

    const handleDeleteClient = async (clientId) => {
        try {
            // Try to delete from database first
            const token = window.storage?.getToken?.();
            if (token && window.api?.deleteClient) {
                try {
                    await window.api.deleteClient(clientId);
                    console.log('✅ Client deleted from database');
                } catch (error) {
                    console.warn('⚠️ Failed to delete client from database:', error);
                }
            }
            
            // Update local state and localStorage
            const updatedClients = clients.filter(c => c.id !== clientId);
            setClients(updatedClients);
            safeStorage.setClients(updatedClients);
            console.log('✅ Client deleted from localStorage');
        } catch (error) {
            console.error('❌ Error deleting client:', error);
        }
    };

    const handleDeleteLead = async (leadId) => {
        try {
            console.log('🗑️ Deleting lead:', leadId);
            console.log('Current leads before deletion:', leads.length);
            
            const token = window.storage?.getToken?.();
            let apiDeleteSuccess = false;
            
            if (token && window.api?.deleteLead) {
                try {
                    // Delete from database
                    await window.api.deleteLead(leadId);
                    console.log('✅ Lead deleted from database');
                    apiDeleteSuccess = true;
                } catch (apiError) {
                    // Check if it's a 404 (lead already deleted)
                    const errorMessage = apiError?.message || String(apiError);
                    const is404 = errorMessage.includes('404') || errorMessage.includes('Not found') || errorMessage.includes('not found');
                    
                    if (is404) {
                        console.log('ℹ️ Lead already deleted (404) - continuing with local cleanup');
                        apiDeleteSuccess = true; // Treat 404 as success since lead is already gone
                    } else {
                        console.error('❌ API error deleting lead:', apiError);
                        // For other errors, still try to remove locally but warn user
                        alert('Failed to delete lead from server: ' + errorMessage + '. The lead will be removed from your view.');
                    }
                }
            } else {
                console.log('⚠️ No authentication token or API available, deleting locally only');
                apiDeleteSuccess = true; // No API = local only delete
            }
            
            // Update local state only if deletion was successful or already deleted
            if (apiDeleteSuccess) {
                const normalizedLeadId = leadId !== undefined && leadId !== null ? String(leadId) : null;
                const updatedLeads = normalizedLeadId
                    ? leads.filter(l => String(l.id) !== normalizedLeadId)
                    : leads;
                setLeads(updatedLeads);
                setLeadsCount(updatedLeads.length); // Update count immediately
                console.log('✅ Lead deleted, new count:', updatedLeads.length);
                
                // Only refresh if we successfully deleted (not if it was already deleted)
                // Also add a delay to prevent rate limiting
                if (token && apiDeleteSuccess) {
                    setTimeout(() => {
                        console.log('🔄 Refreshing leads after deletion...');
                        loadLeads(true); // Force refresh to bypass API throttling
                    }, 500); // Increased delay to prevent rate limiting
                }
            }
            
        } catch (error) {
            console.error('❌ Error deleting lead:', error);
            alert('Failed to delete lead: ' + error.message);
        }
    };

    // Handle column sorting
    const handleSort = (field) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    // Separate sort handler for leads
    const handleLeadSort = (field) => {
        if (leadSortField === field) {
            setLeadSortDirection(leadSortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setLeadSortField(field);
            setLeadSortDirection('asc');
        }
    };

    // Sort function
    const sortClients = (clients) => {
        return [...clients].sort((a, b) => {
            let aValue = a[sortField];
            let bValue = b[sortField];
            
            // Handle date fields
            if (sortField === 'lastContact') {
                aValue = new Date(aValue || 0);
                bValue = new Date(bValue || 0);
            }
            
            // Convert to strings for comparison
            if (typeof aValue === 'string') aValue = aValue.toLowerCase();
            if (typeof bValue === 'string') bValue = bValue.toLowerCase();
            
            if (sortDirection === 'asc') {
                return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
            } else {
                return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
            }
        });
    };

    // Sort function for leads
    const sortLeads = (leads) => {
        return [...leads].sort((a, b) => {
            let aValue = a[leadSortField];
            let bValue = b[leadSortField];
            
            // Handle date fields
            if (leadSortField === 'firstContactDate' || leadSortField === 'lastContact') {
                aValue = new Date(aValue || 0);
                bValue = new Date(bValue || 0);
            }
            
            // Handle stage sorting (Awareness < Interest < Desire < Action)
            if (leadSortField === 'stage') {
                const stageOrder = { 'Awareness': 1, 'Interest': 2, 'Desire': 3, 'Action': 4 };
                aValue = stageOrder[aValue] || 0;
                bValue = stageOrder[bValue] || 0;
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
    };

    // Filter clients - explicitly exclude leads and records without proper type
    // Use multiple checks to ensure leads never appear in clients list
    const filteredClients = clients.filter(client => {
        // Include clients with type='client' OR null/undefined (legacy clients without type field)
        // This matches the logic in loadClients() which includes legacy clients
        if (client.type !== 'client' && client.type !== null && client.type !== undefined) {
            return false; // Exclude leads or any other type value
        }
        
        // Additional safeguard: exclude records with status='Potential' (always a lead)
        // This catches leads that might have been incorrectly saved with type='client'
        if (client.status === 'Potential') {
            console.warn(`⚠️ Filtering out lead with status='Potential' from clients: ${client.name}`);
            return false;
        }
        
        // Enhanced search across multiple fields
        const searchLower = searchTerm.toLowerCase();
        const services = Array.isArray(client.services)
            ? client.services
            : (typeof client.services === 'string' ? (()=>{ try { return JSON.parse(client.services||'[]'); } catch { return []; } })() : []);
        const matchesSearch = searchTerm === '' || 
            client.name.toLowerCase().includes(searchLower) ||
            client.industry.toLowerCase().includes(searchLower) ||
            client.address.toLowerCase().includes(searchLower) ||
            client.website.toLowerCase().includes(searchLower) ||
            client.notes.toLowerCase().includes(searchLower) ||
            // Search in services
            services.some(service => 
                service.toLowerCase().includes(searchLower)
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
        const matchesStatus = filterStatus === 'All Status' || client.status === filterStatus;
        
        // Check if client matches selected services (if any are selected)
        const matchesServices = filterServices.length === 0 || 
            services.some(service => filterServices.includes(service));
        
        // Check if starred filter is applied
        const matchesStarred = !showStarredOnly || client.isStarred === true;
        
        return matchesSearch && matchesIndustry && matchesStatus && matchesServices && matchesStarred;
    });

    // Sort the filtered clients
    const sortedClients = sortClients(filteredClients);

    // Filter leads
    const filteredLeads = leads.filter(lead => {
        const matchesSearch = searchTerm === '' || 
            lead.name.toLowerCase().includes(searchTerm.toLowerCase());
            // Contact search removed for leads
        
        const matchesIndustry = filterIndustry === 'All Industries' || lead.industry === filterIndustry;
        // Status is hardcoded as 'active' for all leads, so status filter doesn't apply
        const matchesStatus = true;
        
        // Check if starred filter is applied
        const matchesStarred = !showStarredOnly || lead.isStarred === true;
        
        return matchesSearch && matchesIndustry && matchesStatus && matchesStarred;
    });

    // Sort the filtered leads (default to alphabetical by name)
    const sortedLeads = sortLeads(filteredLeads);

    // Paginate clients and leads
    const clientsStartIndex = (clientsPage - 1) * ITEMS_PER_PAGE;
    const clientsEndIndex = clientsStartIndex + ITEMS_PER_PAGE;
    const paginatedClients = sortedClients.slice(clientsStartIndex, clientsEndIndex);
    const totalClientsPages = Math.ceil(sortedClients.length / ITEMS_PER_PAGE);

    const leadsStartIndex = (leadsPage - 1) * ITEMS_PER_PAGE;
    const leadsEndIndex = leadsStartIndex + ITEMS_PER_PAGE;
    const paginatedLeads = sortedLeads.slice(leadsStartIndex, leadsEndIndex);
    const totalLeadsPages = Math.ceil(sortedLeads.length / ITEMS_PER_PAGE);

    // Debug pagination - commented to reduce spam
    // console.log(`📄 PAGINATION DEBUG: ${sortedClients.length} clients, showing ${paginatedClients.length} on page ${clientsPage} of ${totalClientsPages}`);

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

    // Reset page to 1 when filters or sort changes
    useEffect(() => {
        setClientsPage(1);
        setLeadsPage(1);
    }, [searchTerm, filterIndustry, filterStatus, filterServices, showStarredOnly, sortField, sortDirection, leadSortField, leadSortDirection]);

    const pipelineStages = ['Awareness', 'Interest', 'Desire', 'Action'];

    const handleOpenClient = (client) => {
        stopSync();
        setEditingClientId(client.id);
        setEditingLeadId(null);
        selectedClientRef.current = client;
        selectedLeadRef.current = null;
        isFormOpenRef.current = true;
        setViewMode('client-detail');
    };

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
            console.warn('⚠️ handleOpenLead: Unable to open lead without identifier', { lead: candidateLead, options });
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
            console.warn('⚠️ handleOpenLead: Fallback identifier used for lead', {
                leadName: candidateLead?.name || '(unknown lead)',
                fallbackId: normalizedId
            });
        }

        stopSync();
        setEditingLeadId(normalizedId);
        setEditingClientId(null);
        selectedLeadRef.current = candidateLead;
        selectedClientRef.current = null;
        isFormOpenRef.current = true;
        if (options.fromPipeline) {
            try {
                sessionStorage.setItem('returnToPipeline', 'true');
            } catch (error) {
                console.warn('⚠️ Clients: Unable to set returnToPipeline flag for lead', error);
            }
        }
        setCurrentLeadTab('overview');
        setViewMode('lead-detail');
    }, [stopSync]);

    const openLeadFromPipeline = useCallback(async ({ leadId, leadData } = {}) => {
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
                console.warn('⚠️ Clients: Unable to fetch lead for pipeline detail view', error);
            }
        }

        handleOpenLead(lead || null, { fromPipeline: true, leadId: resolvedLeadId });
    }, [handleOpenLead]);

    const openOpportunityFromPipeline = useCallback(async ({ opportunityId, clientId, clientName, opportunity } = {}) => {
        const resolvedOpportunityId = opportunityId || opportunity?.id;
        if (!resolvedOpportunityId) return;

        try {
            sessionStorage.setItem('returnToPipeline', 'true');
        } catch (error) {
            console.warn('⚠️ Clients: Unable to set returnToPipeline flag for opportunity', error);
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
                console.warn('⚠️ Clients: Unable to fetch client for opportunity detail view', error);
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
        
        try {
            if (window.DatabaseAPI && typeof window.DatabaseAPI.toggleStarClient === 'function') {
                // Update local state optimistically first
                if (isLead) {
                    setLeads(prevLeads => 
                        prevLeads.map(l => 
                            l.id === clientId ? { ...l, isStarred: !currentStarred } : l
                        )
                    );
                } else {
                    setClients(prevClients => 
                        prevClients.map(c => 
                            c.id === clientId ? { ...c, isStarred: !currentStarred } : c
                        )
                    );
                }
                
                // Call API to persist the change
                await window.DatabaseAPI.toggleStarClient(clientId);
                
                // Refetch to ensure we have the latest data from the database
                if (isLead) {
                    console.log('🔄 Refetching leads after star toggle...');
                    await loadLeads(true); // Force refresh
                } else {
                    console.log('🔄 Refetching clients after star toggle...');
                    await loadClients(true); // Force refresh
                }
                
                console.log(`⭐ Client/lead ${currentStarred ? 'unstarred' : 'starred'}`);
            } else {
                console.error('❌ Star API not available');
            }
        } catch (error) {
            console.error('❌ Failed to toggle star:', error);
            // Revert optimistic update on error
            if (isLead) {
                setLeads(prevLeads => 
                    prevLeads.map(l => 
                        l.id === clientId ? { ...l, isStarred: currentStarred } : l
                    )
                );
            } else {
                setClients(prevClients => 
                    prevClients.map(c => 
                        c.id === clientId ? { ...c, isStarred: currentStarred } : c
                    )
                );
            }
            alert('Failed to update star. Please try again.');
        }
    };

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

        window.addEventListener('openLeadDetailFromPipeline', handleLeadEvent);
        window.addEventListener('openOpportunityDetailFromPipeline', handleOpportunityEvent);

        // Expose direct callbacks for legacy modules that prefer calling functions instead of dispatching events
        window.__openLeadDetailFromPipeline = openLeadFromPipeline;
        window.__openOpportunityDetailFromPipeline = openOpportunityFromPipeline;

        return () => {
            window.removeEventListener('openLeadDetailFromPipeline', handleLeadEvent);
            window.removeEventListener('openOpportunityDetailFromPipeline', handleOpportunityEvent);

            if (window.__openLeadDetailFromPipeline === openLeadFromPipeline) {
                delete window.__openLeadDetailFromPipeline;
            }
            if (window.__openOpportunityDetailFromPipeline === openOpportunityFromPipeline) {
                delete window.__openOpportunityDetailFromPipeline;
            }
        };
    }, [openLeadFromPipeline, openOpportunityFromPipeline]);

    const handleNavigateToProject = (projectId) => {
        sessionStorage.setItem('openProjectId', projectId);
        setViewMode('clients');
        selectedClientRef.current = null;
        window.dispatchEvent(new CustomEvent('navigateToPage', { 
            detail: { page: 'projects', projectId } 
        }));
    };

    const convertLeadToClient = (lead) => {
        const newClient = {
            id: Math.max(0, ...clients.map(c => c.id)) + 1,
            name: lead.name,
            industry: lead.industry,
            status: 'Active',
            type: 'client',
            revenue: 0,
            lastContact: new Date().toISOString().split('T')[0],
            address: '',
            website: '',
            notes: lead.notes,
            contacts: lead.contacts || [],
            followUps: lead.followUps || [],
            projectIds: lead.projectIds || [],
            comments: lead.comments || [],
            sites: [],
            opportunities: [],
            services: lead.services || [],
            activityLog: [{
                id: Date.now(),
                type: 'Lead Converted',
                description: `Converted from lead to client`,
                timestamp: new Date().toISOString(),
                user: (() => {
                    const u = window.storage?.getUser?.() || {};
                    return u.name || 'System';
                })(),
                userId: (() => {
                    const u = window.storage?.getUser?.() || {};
                    return u.id || 'system';
                })(),
                userEmail: (() => {
                    const u = window.storage?.getUser?.() || {};
                    return u.email || 'system';
                })()
            }]
        };
        setClients([...clients, newClient]);
        const normalizedLeadId = lead && lead.id !== undefined && lead.id !== null ? String(lead.id) : null;
        setLeads(leads.filter(l => (normalizedLeadId ? String(l.id) !== normalizedLeadId : l !== lead)));
        setViewMode('clients');
        selectedLeadRef.current = null; // Clear selected lead ref
        alert('Lead converted to client!');
    };

    // Legacy Pipeline View Component (fallback if new Pipeline module fails to load)
    const LegacyPipelineView = () => {
        const [draggedItem, setDraggedItem] = useState(null);
        const [draggedType, setDraggedType] = useState(null);
        const [didDrag, setDidDrag] = useState(false);
        
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
                        console.warn(`⚠️ Failed to reload opportunities in bulk:`, error.message || error);
                    }
                }
            };
            
            window.addEventListener('opportunitiesUpdated', handleOpportunitiesUpdated);
            return () => window.removeEventListener('opportunitiesUpdated', handleOpportunitiesUpdated);
        }, []); // Empty deps - only set up listener once
        
        let clientOpportunities = clients.reduce((acc, client) => {
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
                if (mapped.length > 0) {
                }
                return acc.concat(mapped);
            }
            return acc;
        }, []);
        

        // Filter active leads and normalize stages to match AIDA pipeline stages
        const activeLeads = leads.map(lead => {
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
            } else if (!['Awareness', 'Interest', 'Desire', 'Action'].includes(mappedStage)) {
                // If stage doesn't match AIDA stages, default to Awareness
                mappedStage = 'Awareness';
            }
            
            if (originalStage !== mappedStage) {
                console.log(`🔄 PipelineView: Mapped lead stage "${originalStage}" → "${mappedStage}" for ${lead.name || lead.id}`);
            }
            
            return { ...lead, stage: mappedStage };
        }).filter(lead => {
            // Filter out inactive leads
            return lead.status !== 'Inactive' && lead.status !== 'Disinterested';
        });
        
        // Filter active opportunities
        const activeOpportunities = clientOpportunities.filter(opp => {
            const status = opp.status || 'Active'; // Default to 'Active' if no status
            return status !== 'Inactive' && status !== 'Closed Lost' && status !== 'Closed Won';
        });

        const handleDragStart = (item, type) => {
            setDidDrag(true);
            setDraggedItem(item);
            setDraggedType(type);
        };

        const handleDragOver = (e) => {
            e.preventDefault();
        };

        const handleDrop = (e, targetStage) => {
            e.preventDefault();
            
            if (!draggedItem || !draggedType || draggedItem.stage === targetStage) {
                setDraggedItem(null);
                setDraggedType(null);
                return;
            }

            if (draggedType === 'lead') {
                const updatedLeads = leads.map(lead => 
                    lead.id === draggedItem.id ? { ...lead, stage: targetStage } : lead
                );
                setLeads(updatedLeads);
                
                // Save to API
                const token = window.storage?.getToken?.();
                if (token && window.DatabaseAPI) {
                    window.DatabaseAPI.updateLead(draggedItem.id, { stage: targetStage })
                        .catch(err => console.error('❌ Failed to update lead stage:', err));
                }
            } else if (draggedType === 'opportunity') {
                const updatedClients = clients.map(client => {
                    if (client.id === draggedItem.clientId) {
                        const updatedOpportunities = client.opportunities.map(opp =>
                            opp.id === draggedItem.id ? { ...opp, stage: targetStage } : opp
                        );
                        return { ...client, opportunities: updatedOpportunities };
                    }
                    return client;
                });
                setClients(updatedClients);
                safeStorage.setClients(updatedClients);
                
                // Save opportunity update to API if opportunity has an ID
                const token = window.storage?.getToken?.();
                if (token && window.api && window.api.updateOpportunity && draggedItem.id) {
                    window.api.updateOpportunity(draggedItem.id, { stage: targetStage })
                        .catch(err => {
                            console.error('❌ Failed to update opportunity stage via API:', err);
                        });
                }
            }

            setDraggedItem(null);
            setDraggedType(null);
            // Small delay to distinguish drag from click
            setTimeout(() => setDidDrag(false), 50);
            // No need to trigger full reload - state already updated and API call made
        };

        const handleDragEnd = () => {
            setDraggedItem(null);
            setDraggedType(null);
        };

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

                {/* Enhanced Pipeline Board */}
                <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-6 -mx-3 sm:mx-0 px-3 sm:px-0" style={{ WebkitOverflowScrolling: 'touch' }}>
                    {pipelineStages.map(stage => {
                        const stageLeads = activeLeads.filter(lead => lead.stage === stage);
                        const stageOpps = activeOpportunities.filter(opp => opp.stage === stage);
                        const stageCount = stageLeads.length + stageOpps.length;
                        const isDraggedOver = draggedItem && draggedItem.stage !== stage;
                        
                        const stageIcons = {
                            'Awareness': 'fa-eye',
                            'Interest': 'fa-search',
                            'Desire': 'fa-heart',
                            'Action': 'fa-rocket'
                        };

                        const stageColors = {
                            'Awareness': 'from-gray-500 to-gray-600',
                            'Interest': 'from-blue-500 to-blue-600',
                            'Desire': 'from-yellow-500 to-yellow-600',
                            'Action': 'from-green-500 to-green-600'
                        };
                        
                        return (
                            <div 
                                key={stage} 
                                data-pipeline-stage={stage}
                                className={`flex-1 min-w-[280px] sm:min-w-[250px] ${isDark ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-lg border transition-all duration-300 ${
                                    isDark ? 'border-gray-700' : 'border-gray-200'
                                } ${
                                    isDraggedOver ? `ring-2 ring-primary-500 ${isDark ? 'bg-primary-900' : 'bg-primary-50'} transform scale-105` : 'hover:shadow-xl'
                                }`}
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, stage)}
                            >
                                {/* Stage Header with Gradient */}
                                <div className={`bg-gradient-to-r ${stageColors[stage]} rounded-t-xl p-3 mb-3 -mx-1 -mt-1`}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 bg-white/20 rounded-lg flex items-center justify-center">
                                                <i className={`fas ${stageIcons[stage]} text-white text-xs`}></i>
                                            </div>
                                            <div>
                                                <h3 className="text-white font-semibold text-sm">{stage}</h3>
                                                <p className="text-white/80 text-xs">{stageCount} items</p>
                                            </div>
                                        </div>
                                        <span className={`px-2 py-0.5 ${isDark ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'} rounded-full text-xs font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'} border`}>
                                            {stageLeads.length + stageOpps.length}
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    {stageLeads.length === 0 && stageOpps.length === 0 && (
                                        <div className={`text-center py-12 rounded-xl border-2 border-dashed transition-all duration-300 ${
                                            isDraggedOver ? `border-primary-400 ${isDark ? 'bg-primary-900' : 'bg-primary-50'} scale-105` : `${isDark ? 'border-gray-600 hover:border-gray-500' : 'border-gray-300 hover:border-gray-400'}`
                                        }`}>
                                            <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                                                <i className="fas fa-plus text-2xl text-gray-400"></i>
                                            </div>
                                            <p className={`text-sm font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'} mb-1`}>No items yet</p>
                                            <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Drag items here or add new ones</p>
                                        </div>
                                    )}
                                    
                                    {stageLeads.map(lead => (
                                        <div 
                                            key={`lead-${lead.id}-${stage}-${lead.name}`}
                                            draggable
                                            onDragStart={() => handleDragStart(lead, 'lead')}
                                            onDragEnd={handleDragEnd}
                                            onClick={() => handleOpenLead(lead)}
                                            className={`${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-white hover:bg-gray-50'} rounded-lg p-2.5 border transition-all duration-300 cursor-move group ${
                                                isDark ? 'border-gray-600 hover:border-gray-500' : 'border-gray-200 hover:border-gray-300'
                                            } ${
                                                draggedItem?.id === lead.id ? 'opacity-50 transform scale-95' : 'hover:shadow-md hover:-translate-y-0.5'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-2 mb-2">
                                                <div className="flex-1">
                                                    <h4 className={`font-semibold text-xs ${isDark ? 'text-gray-100' : 'text-gray-900'} line-clamp-2 mb-0.5 ${isDark ? 'group-hover:text-primary-400' : 'group-hover:text-primary-600'} transition-colors`}>{lead.name}</h4>
                                                    <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{lead.industry}</p>
                                            </div>
                                                <span className="px-2 py-0.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-xs rounded-full font-medium shrink-0 shadow-sm">LEAD</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{lead.status}</span>
                                            </div>
                                        </div>
                                    ))}
                                    
                                    {stageOpps.map((opp, idx) => {
                                        const client = clients.find(c => c.id === opp.clientId);
                                        return (
                                            <div 
                                                key={`opp-${opp.id}-${idx}`}
                                                draggable
                                                onDragStart={() => handleDragStart(opp, 'opportunity')}
                                                onDragEnd={handleDragEnd}
                                                onClick={(e) => {
                                                    if (didDrag) {
                                                        e.preventDefault();
                                                        return;
                                                    }
                                                    openOpportunityFromPipeline({
                                                        opportunityId: opp.id,
                                                        clientId: client?.id || opp.clientId,
                                                        clientName: client?.name || opp.clientName,
                                                        opportunity: opp
                                                    });
                                                }}
                                                className={`${isDark ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'} rounded-lg p-2.5 border shadow-sm hover:shadow-md cursor-move transition ${
                                                    draggedItem?.id === opp.id ? 'opacity-50' : ''
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-2 mb-2">
                                                    <div className={`font-medium text-sm ${isDark ? 'text-gray-100' : 'text-gray-900'} line-clamp-2 flex-1`}>{opp.title || opp.name || 'Untitled Opportunity'}</div>
                                                    <span className={`px-2 py-0.5 ${isDark ? 'bg-green-900 text-green-200' : 'bg-green-100 text-green-700'} text-xs rounded-full font-medium shrink-0`}>OPP</span>
                                                </div>
                                                <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-2`}>
                                                    <i className="fas fa-building mr-1"></i>
                                                    {opp.clientName}
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Existing client</span>
                                                    {opp.value > 0 && (
                                                        <span className={`text-xs font-medium ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                                                            R {opp.value.toLocaleString('en-ZA')}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // Clients List View
    const ClientsListView = () => (
        <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border flex flex-col h-full`}>
            <div className="flex-1 overflow-auto -mx-3 sm:mx-0 px-3 sm:px-0" style={{ WebkitOverflowScrolling: 'touch' }}>
                <table className={`min-w-full divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-200'}`} style={{ minWidth: '640px' }}>
                    <thead className={isDark ? 'bg-gray-700' : 'bg-gray-50'}>
                        <tr>
                            <th 
                                className={`px-6 py-4 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider cursor-pointer ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
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
                                className={`px-6 py-4 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider cursor-pointer ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                                onClick={() => handleSort('industry')}
                            >
                                <div className="flex items-center">
                                    Industry
                                    {sortField === 'industry' && (
                                        <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ml-1 text-xs`}></i>
                                    )}
                                </div>
                            </th>
                            <th className={`px-6 py-4 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider`}>
                                Services
                            </th>
                            <th className={`px-6 py-4 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider`}>
                                Tags
                            </th>
                            <th 
                                className={`px-6 py-4 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider cursor-pointer ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
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
                    <tbody className={`${isDark ? 'bg-gray-800 divide-gray-700' : 'bg-white divide-gray-200'} divide-y`}>
                        {paginatedClients.length === 0 ? (
                            <tr>
                                    <td colSpan="5" className={`px-6 py-8 text-center text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                        <i className={`fas fa-inbox text-3xl ${isDark ? 'text-gray-600' : 'text-gray-300'} mb-2`}></i>
                                    <p>No clients found</p>
                                </td>
                            </tr>
                        ) : (
                            paginatedClients.filter(client => {
                                // Final render-time safety check: ensure type is 'client' and not 'Potential' status
                                return client.type === 'client' && client.status !== 'Potential';
                            }).map(client => (
                                <tr 
                                    key={client.id} 
                                    onClick={() => handleOpenClient(client)}
                                        className={`${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'} cursor-pointer transition`}
                                >
                                    <td className="px-6 py-5 whitespace-nowrap">
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
                                    <td className={`px-6 py-5 whitespace-nowrap text-sm ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>{client.industry}</td>
                                    <td className="px-6 py-5 whitespace-nowrap">
                                        <div className="flex flex-wrap gap-1.5">
                                            {(() => {
                                                const services = Array.isArray(client.services)
                                                    ? client.services
                                                    : (typeof client.services === 'string' ? (()=>{ try { return JSON.parse(client.services||'[]'); } catch { return []; } })() : []);
                                                const MAX = 3;
                                                const visible = services.slice(0, MAX);
                                                const remaining = services.length - visible.length;
                                                return (
                                                    <>
                                                        {visible.map(s => (
                                                            <span key={s} className={`inline-flex items-center px-2 py-0.5 text-[10px] rounded ${isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700'}`}>
                                                                <i className="fas fa-tag mr-1"></i>{s}
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
                                    <td className="px-6 py-5 whitespace-nowrap">
                                        <div className="flex flex-wrap gap-1.5">
                                            {(() => {
                                                const tags = Array.isArray(client.tags) 
                                                    ? client.tags 
                                                    : (client.tags ? [client.tags] : []);
                                                // Handle tags that might be objects with name property
                                                const tagNames = tags.map(tag => typeof tag === 'object' && tag.name ? tag.name : tag).filter(Boolean);
                                                const MAX = 3;
                                                const visible = tagNames.slice(0, MAX);
                                                const remaining = tagNames.length - visible.length;
                                                return (
                                                    <>
                                                        {visible.map((tag, idx) => {
                                                            const tagObj = typeof tags[idx] === 'object' && tags[idx] ? tags[idx] : { name: tag, color: '#3B82F6' };
                                                            const tagColor = tagObj.color || '#3B82F6';
                                                            const tagName = typeof tag === 'object' && tag.name ? tag.name : tag;
                                                            return (
                                                                <span 
                                                                    key={idx} 
                                                                    className={`inline-flex items-center px-2 py-0.5 text-[10px] rounded text-white`}
                                                                    style={{ backgroundColor: tagColor }}
                                                                >
                                                                    <i className="fas fa-tag mr-1"></i>{tagName}
                                                                </span>
                                                            );
                                                        })}
                                                        {remaining > 0 && (
                                                            <span className={`inline-flex items-center px-2 py-0.5 text-[10px] rounded ${isDark ? 'bg-primary-900 text-primary-200' : 'bg-primary-100 text-primary-700'}`}>+{remaining}</span>
                                                        )}
                                                        {tagNames.length === 0 && (
                                                            <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>None</span>
                                                        )}
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </td>
                                    <td className="px-6 py-5 whitespace-nowrap">
                                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                            (client.status === 'Active' || client.status === 'active') ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                        }`}>
                                            {client.status === 'active' ? 'Active' : client.status}
                                        </span>
                                    </td>
                                </tr>
                            ))
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
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} disabled:opacity-50 disabled:cursor-not-allowed`}
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
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            Next
                            <i className="fas fa-chevron-right ml-1"></i>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );

    const PipelineView = React.memo(({
        items,
        isDark,
        boardView,
        onBoardViewChange,
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
                Awareness: 'bg-gray-100 text-gray-800',
                Interest: 'bg-blue-100 text-blue-800',
                Desire: 'bg-yellow-100 text-yellow-800',
                Action: 'bg-green-100 text-green-800'
            };
            const darkMap = {
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
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide">Stage</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide">Value</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide">Organisation</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide">Owner</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide">Updated</th>
                            </tr>
                        </thead>
                        <tbody className={`${isDark ? 'bg-gray-800 divide-gray-700' : 'bg-white divide-gray-200'} divide-y`}>
                            {sortedItems.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="px-6 py-16 text-center">
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
                                        className={`${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'} cursor-pointer transition`}
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
                                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${getStageBadgeClasses(item.stage)}`}>
                                                {item.stage}
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

        const renderKanbanView = () => (
            <div className="flex gap-4 overflow-x-auto pb-4">
                {stages.map((stage) => {
                    const stageItems = groupedByStage[stage] || [];
                    const stageValue = stageItems.reduce((sum, item) => sum + (item.value || 0), 0);

                    return (
                        <div
                            key={stage}
                            className={`flex-1 min-w-[260px] rounded-lg border ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} shadow-sm`}
                        >
                            <div className={`px-4 py-3 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className={`text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{stage}</h3>
                                        <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                            {stageItems.length} item{stageItems.length === 1 ? '' : 's'}
                                        </p>
                                    </div>
                                    <div className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                                        {formatCurrency(stageValue)}
                                    </div>
                                </div>
                            </div>
                            <div className="p-4 space-y-3">
                                {stageItems.length === 0 ? (
                                    <div className={`text-sm italic ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>No items</div>
                                ) : (
                                    stageItems.map((item) => (
                                        <div
                                            key={item.key}
                                            onClick={() => handleItemOpen(item)}
                                            className={`rounded-lg border ${isDark ? 'border-gray-700 bg-gray-800 hover:bg-gray-700' : 'border-gray-200 bg-gray-50 hover:bg-white'} transition shadow-sm cursor-pointer`}
                                        >
                                            <div className="p-3 space-y-2">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div>
                                                        <div className={`text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{item.name}</div>
                                                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                            {item.organization}
                                                        </div>
                                                    </div>
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${typeBadgeClasses(item.type)}`}>
                                                        {item.type === 'lead' ? 'Lead' : 'Opportunity'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>
                                                        {formatCurrency(item.value)}
                                                    </span>
                                                    <span className={isDark ? 'text-gray-500' : 'text-gray-500'}>
                                                        {item.owner || 'Unassigned'}
                                                    </span>
                                                </div>
                                                <div className={`text-[11px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                                    Updated {new Date(item.updatedAt || Date.now()).toLocaleDateString('en-ZA')}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        );

        return (
            <div className="space-y-6">
                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-xl border shadow-sm p-4 flex flex-wrap gap-3 items-center justify-between`}>
                    <div className="flex items-center flex-wrap gap-2">
                        <div className="inline-flex rounded-lg border overflow-hidden">
                            <button
                                type="button"
                                onClick={() => onBoardViewChange('list')}
                                className={`px-3 py-1.5 text-sm font-medium ${boardView === 'list' ? 'bg-blue-600 text-white' : isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
                            >
                                <i className="fas fa-list mr-1.5"></i>
                                List
                            </button>
                            <button
                                type="button"
                                onClick={() => onBoardViewChange('kanban')}
                                className={`px-3 py-1.5 text-sm font-medium ${boardView === 'kanban' ? 'bg-blue-600 text-white' : isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
                            >
                                <i className="fas fa-columns mr-1.5"></i>
                                Kanban
                            </button>
                        </div>
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
                {boardView === 'kanban' ? renderKanbanView() : renderListView()}
            </div>
        );
    });

    // Leads List View
    // Note: Lead status is now hardcoded as 'active' - removed handleLeadStatusChange function

    const LeadsListView = () => (
        <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border flex flex-col h-full`}>
            <div className="flex-1 overflow-auto">
                <table className={`min-w-full divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-200'}`}>
                    <thead className={isDark ? 'bg-gray-700' : 'bg-gray-50'}>
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
                                onClick={() => handleLeadSort('stage')}
                            >
                                <div className="flex items-center">
                                    Stage
                                    {leadSortField === 'stage' && (
                                        <i className={`fas fa-sort-${leadSortDirection === 'asc' ? 'up' : 'down'} ml-1 text-xs`}></i>
                                    )}
                                </div>
                            </th>
                            <th className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider`}>
                                Status
                            </th>
                            <th 
                                className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider cursor-pointer ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                                onClick={() => handleLeadSort('firstContactDate')}
                            >
                                <div className="flex items-center">
                                    Time Since Contact
                                    {leadSortField === 'firstContactDate' && (
                                        <i className={`fas fa-sort-${leadSortDirection === 'asc' ? 'up' : 'down'} ml-1 text-xs`}></i>
                                    )}
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody className={`${isDark ? 'bg-gray-800 divide-gray-700' : 'bg-white divide-gray-200'} divide-y`}>
                        {paginatedLeads.length === 0 ? (
                            <tr>
                                <td colSpan="5" className={`px-6 py-12 text-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                    <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                                        <i className="fas fa-user-plus text-2xl text-gray-400"></i>
                                    </div>
                                    <p className="text-lg font-medium mb-2">No leads found</p>
                                    <p className="text-sm">Get started by adding your first lead</p>
                                </td>
                            </tr>
                        ) : (
                            paginatedLeads.map(lead => (
                                <tr 
                                    key={`lead-${lead.id}-${lead.name}`}
                                    onClick={() => handleOpenLead(lead)}
                                        className={`${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'} cursor-pointer transition`}
                                >
                                    <td className="px-6 py-4 whitespace-nowrap">
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
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{lead.industry}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                                            lead.stage === 'Awareness' ? (isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-800') :
                                            lead.stage === 'Interest' ? (isDark ? 'bg-blue-900 text-blue-200' : 'bg-blue-100 text-blue-800') :
                                            lead.stage === 'Desire' ? (isDark ? 'bg-yellow-900 text-yellow-200' : 'bg-yellow-100 text-yellow-800') :
                                            (isDark ? 'bg-green-900 text-green-200' : 'bg-green-100 text-green-800')
                                        }`}>
                                            {lead.stage}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 py-1 text-xs font-medium rounded ${isDark ? 'bg-green-900 text-green-200' : 'bg-green-100 text-green-700'}`}>
                                            Active
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className={`text-sm ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                                            {getTimeSinceFirstContact(lead.firstContactDate)}
                                        </div>
                                        {lead.firstContactDate && (
                                            <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                {new Date(lead.firstContactDate).toLocaleDateString()}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))
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
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} disabled:opacity-50 disabled:cursor-not-allowed`}
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
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} disabled:opacity-50 disabled:cursor-not-allowed`}
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
        
        return (
        <div className={`min-h-screen ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
            {/* Header with breadcrumb */}
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b px-6 py-4`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <button 
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
                        client={selectedClient}
                        onSave={handleSaveClient}
                        onClose={handleClientModalClose}
                        onDelete={handleDeleteClient}
                        allProjects={projects}
                        onNavigateToProject={handleNavigateToProject}
                        isFullPage={true}
                        initialTab={currentTab}
                        onTabChange={setCurrentTab}
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
        const LeadDetailModalComponent = useEnsureGlobalComponent('LeadDetailModal');
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
                            onClick={async () => {
                                // Refresh leads from database to ensure we have latest persisted data
                                console.log('🔄 Refreshing leads after closing lead detail...');
                                await loadLeads(true); // Force refresh to get latest data
                                const returnToPipeline = (() => {
                                    try {
                                        return sessionStorage.getItem('returnToPipeline') === 'true';
                                    } catch (error) {
                                        console.warn('⚠️ Clients: Unable to read returnToPipeline flag on lead close', error);
                                        return false;
                                    }
                                })();

                                if (returnToPipeline) {
                                    try {
                                        sessionStorage.removeItem('returnToPipeline');
                                    } catch (error) {
                                        console.warn('⚠️ Clients: Unable to clear returnToPipeline flag on lead close', error);
                                    }
                                    setViewMode('pipeline');
                                } else {
                                    setViewMode('leads');
                                }
                                selectedLeadRef.current = null;
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

            {/* Full-page lead detail content */}
            <div className="p-6">
                {LeadDetailModalComponent ? (
                    <LeadDetailModalComponent
                        key={editingLeadId || 'new-lead'}
                        leadId={editingLeadId}
                        initialLead={selectedLead}
                        onSave={handleSaveLead}
                        onClose={handleLeadModalClose}
                        onDelete={handleDeleteLead}
                        onConvertToClient={convertLeadToClient}
                        allProjects={projects}
                        isFullPage={true}
                        initialTab={currentLeadTab}
                        onTabChange={setCurrentLeadTab}
                        onPauseSync={handlePauseSync}
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
            <div className="flex-shrink-0 space-y-5 sm:space-y-8 pl-10 sm:pl-16 pr-4 sm:pr-6 pt-5 sm:pt-6 pb-2 w-full max-w-full" style={{ width: '100%', maxWidth: '100%' }}>
            {/* Modern Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-6 pb-2">
                <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
                        <i className="fas fa-users text-white text-sm sm:text-lg"></i>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                                <h1 
                                    id="clients-leads-heading"
                                    className={`text-lg sm:text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}
                                    style={{ 
                                        color: isDark ? '#f3f4f6' : '#111827',
                                        WebkitTextFillColor: isDark ? '#f3f4f6' : '#111827'
                                    }}
                                >
                                    Clients and Leads
                                </h1>
                                <p 
                                    className={`text-xs sm:text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}
                                    style={{ color: isDark ? '#9ca3af' : '#4b5563' }}
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
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 pr-4 sm:pr-6">
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
                    }}
                        className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2.5 border rounded-lg text-sm font-medium transition-all duration-200 shadow-sm hover:shadow-md min-h-[44px] sm:min-h-0 ${
                            isDark 
                                ? 'bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600' 
                                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                    >
                        <div className={`w-5 h-5 rounded-md flex items-center justify-center ${
                            isDark ? 'bg-blue-900/30' : 'bg-blue-100'
                        }`}>
                            <i className={`fas fa-plus text-xs ${
                                isDark ? 'text-blue-400' : 'text-blue-600'
                            }`}></i>
                        </div>
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
                    }}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-all duration-200 shadow-sm hover:shadow-md min-h-[44px] sm:min-h-0"
                    >
                        <div className="w-5 h-5 bg-blue-500 rounded-md flex items-center justify-center">
                            <i className="fas fa-plus text-xs"></i>
                        </div>
                        <span>Add Lead</span>
                    </button>
                </div>
            </div>

            {/* Modern View Tabs */}
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-xl border p-1.5 sm:p-1 flex sm:inline-flex shadow-sm overflow-x-auto sm:overflow-x-visible mb-2 gap-1`}>
                <button
                    onClick={() => setViewMode('clients')}
                    className={`px-3 sm:px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap min-h-[44px] sm:min-h-0 flex-shrink-0 ${
                        viewMode === 'clients' 
                            ? 'bg-blue-600 text-white shadow-sm' 
                            : isDark 
                                ? 'text-gray-300 hover:text-gray-100 hover:bg-gray-700' 
                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <i className="fas fa-building mr-2"></i>
                    <span className="hidden sm:inline">Clients ({clients.length})</span>
                    <span className="sm:hidden">Clients</span>
                </button>
                <button
                    onClick={() => setViewMode('leads')}
                    className={`px-3 sm:px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap min-h-[44px] sm:min-h-0 flex-shrink-0 ${
                        viewMode === 'leads' 
                            ? 'bg-blue-600 text-white shadow-sm' 
                            : isDark 
                                ? 'text-gray-300 hover:text-gray-100 hover:bg-gray-700' 
                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <i className="fas fa-star mr-2"></i>
                    <span className="hidden sm:inline">Leads ({leadsCount})</span>
                    <span className="sm:hidden">Leads</span>
                </button>
                <button
                    onClick={() => {
                        setViewMode('pipeline');
                    }}
                    className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                        viewMode === 'pipeline' 
                            ? 'bg-blue-600 text-white shadow-sm' 
                            : isDark 
                                ? 'text-gray-300 hover:text-gray-100 hover:bg-gray-700' 
                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <i className="fas fa-stream mr-2"></i>
                    Pipeline
                </button>
                <button
                    onClick={() => setViewMode('news-feed')}
                    className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                        viewMode === 'news-feed' 
                            ? 'bg-blue-600 text-white shadow-sm' 
                            : isDark 
                                ? 'text-gray-300 hover:text-gray-100 hover:bg-gray-700' 
                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <i className="fas fa-newspaper mr-2"></i>
                    News Feed
                </button>
            </div>

        {/* Modern Search and Filters */}
        {viewMode !== 'client-detail' && viewMode !== 'lead-detail' && viewMode !== 'pipeline' && (
                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-xl border p-5 sm:p-6 shadow-sm`}>
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
                                            ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-400 focus:bg-gray-700' 
                                            : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-500 focus:bg-white'
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
                        <div>
                            <select
                                value={filterIndustry}
                                onChange={(e) => setFilterIndustry(e.target.value)}
                                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-colors ${
                                    isDark 
                                        ? 'bg-gray-700 border-gray-600 text-gray-200 focus:bg-gray-700' 
                                        : 'bg-gray-50 border-gray-300 text-gray-900 focus:bg-white'
                                }`}
                            >
                                <option value="All Industries">All Industries</option>
                                <option value="Mining">Mining</option>
                                <option value="Forestry">Forestry</option>
                                <option value="Agriculture">Agriculture</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                        <div>
                            <select
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-colors ${
                                    isDark 
                                        ? 'bg-gray-700 border-gray-600 text-gray-200 focus:bg-gray-700' 
                                        : 'bg-gray-50 border-gray-300 text-gray-900 focus:bg-white'
                                }`}
                            >
                                <option value="All Status">All Status</option>
                                <option value="Potential">Potential</option>
                                <option value="Active">Active</option>
                                <option value="Disinterested">Disinterested</option>
                            </select>
                        </div>
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
                        <div className="flex items-center">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={showStarredOnly}
                                    onChange={(e) => setShowStarredOnly(e.target.checked)}
                                    className={`w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${
                                        isDark ? 'bg-gray-700 border-gray-600' : ''
                                    }`}
                                />
                                <span className={`text-sm ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                                    <i className="fas fa-star text-yellow-500 mr-1"></i>
                                    Starred Only
                                </span>
                            </label>
                        </div>
                    </div>
                    
                    {/* Modern Search Results Counter */}
                    {(searchTerm || filterIndustry !== 'All Industries' || filterStatus !== 'All Status' || (viewMode !== 'leads' && filterServices.length > 0) || showStarredOnly) && (
                        <div className={`mt-5 sm:mt-6 pt-5 sm:pt-6 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                    <span>
                                        {viewMode === 'leads' 
                                            ? `Showing ${filteredLeads.length} of ${leads.length} leads${searchTerm ? ` matching "${searchTerm}"` : ''}`
                                            : `Showing ${filteredClients.length} of ${clients.length} clients${searchTerm ? ` matching "${searchTerm}"` : ''}`
                                        }
                                    </span>
                                </div>
                                <button
                                    onClick={() => {
                                        setSearchTerm('');
                                        setFilterIndustry('All Industries');
                                        setFilterStatus('All Status');
                                        if (viewMode !== 'leads') {
                                            setFilterServices([]);
                                        }
                                    }}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-blue-600 hover:text-blue-700 font-medium text-sm transition-colors"
                                >
                                    <i className="fas fa-times text-xs"></i>
                                    Clear filters
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
            </div>

            {/* Content based on view mode */}
            <div className="flex-1 overflow-hidden pl-10 sm:pl-16 pr-4 sm:pr-6 pb-5 sm:pb-6 pt-2 min-h-0">
            {viewMode === 'clients' && <ClientsListView />}
            {viewMode === 'leads' && <LeadsListView />}
            {viewMode === 'pipeline' && (
                isNewPipelineAvailable ? (
                    <PipelineComponent
                        onOpenLead={openLeadFromPipeline}
                        onOpenOpportunity={openOpportunityFromPipeline}
                    />
                ) : (
                    <PipelineView
                        items={pipelineItems}
                        isDark={isDark}
                        boardView={pipelineBoardView}
                        onBoardViewChange={setPipelineBoardView}
                        typeFilter={pipelineTypeFilter}
                        onTypeFilterChange={setPipelineTypeFilter}
                        stages={PIPELINE_STAGES}
                        isLoading={isPipelineLoading}
                        onOpenLead={openLeadFromPipeline}
                        onOpenOpportunity={openOpportunityFromPipeline}
                    />
                )
            )}
            {viewMode === 'news-feed' && (window.ClientNewsFeed ? <window.ClientNewsFeed /> : <div className="text-center py-12 text-gray-500">Loading News Feed...</div>)}
            {viewMode === 'client-detail' && <ClientDetailView />}
            {viewMode === 'lead-detail' && <LeadDetailView />}
            {viewMode === 'opportunity-detail' && selectedOpportunityId && (
                <OpportunityDetailView 
                    opportunityId={selectedOpportunityId}
                    client={selectedOpportunityClient}
                    onClose={() => {
                        setSelectedOpportunityId(null);
                        setSelectedOpportunityClient(null);
                        let returnToPipeline = false;
                        try {
                            returnToPipeline = sessionStorage.getItem('returnToPipeline') === 'true';
                        } catch (error) {
                            console.warn('⚠️ Clients: Unable to read returnToPipeline flag on opportunity close', error);
                        }
                        if (returnToPipeline) {
                            try {
                                sessionStorage.removeItem('returnToPipeline');
                            } catch (error) {
                                console.warn('⚠️ Clients: Unable to clear returnToPipeline flag on opportunity close', error);
                            }
                            setViewMode('pipeline');
                        } else {
                            setViewMode('clients');
                        }
                    }}
                />
            )}
            </div>
        </div>
    );
});

// Force register as the main Clients component (overrides ClientsCached if it loaded first)
window.Clients = Clients;
// Mark this as the preferred component version
window.Clients._isPaginated = true;
window.Clients._version = 'paginated-v1';
console.log('✅ Clients.jsx component registered (with Pipeline opportunity fixes and pagination)');
console.log('🔍 window.Clients type:', typeof window.Clients, 'is function?', typeof window.Clients === 'function');
console.log('🔍 window.Clients value:', window.Clients);

// Notify MainLayout that Clients component is now available
// Use multiple notification methods for maximum compatibility
window._clientsComponentReady = true; // Flag for late listeners

if (typeof window.dispatchEvent === 'function') {
    try {
        // Dispatch immediately
        window.dispatchEvent(new CustomEvent('clientsComponentReady'));
        console.log('📢 Dispatched clientsComponentReady event');
        
        // Also dispatch after a small delay in case listeners weren't ready
        setTimeout(() => {
            window.dispatchEvent(new CustomEvent('clientsComponentReady'));
        }, 100);
        
        // One more delayed dispatch for safety
        setTimeout(() => {
            window.dispatchEvent(new CustomEvent('clientsComponentReady'));
        }, 500);
    } catch (e) {
        console.warn('⚠️ Could not dispatch clientsComponentReady event:', e);
    }
}


