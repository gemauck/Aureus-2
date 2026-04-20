/**
 * Shared labels and helpers for JobCardActivity rows (classic manufacturing + mobile wizard).
 */

export const JOB_CARD_ACTIVITY_STEP_LABELS = {
  assignment: 'Team & Client',
  visit: 'Site Visit',
  work: 'Work Notes',
  stock: 'Stock & Costs',
  signoff: 'Customer Sign-off'
};

/** Alphabetical options for JobCard.callOutCategory (Site Visit step). */
export const JOB_CARD_CALL_OUT_CATEGORY_OPTIONS = [
  'Air pump',
  'Calibration',
  'Maintenance',
  'Near Miss',
  'New Install',
  'Observation'
];

/** Prisma/API field keys → short labels for activity "what changed" lines */
export const JOB_CARD_FIELD_LABELS = {
  agentName: 'Lead technician',
  otherTechnicians: 'Other technicians',
  clientId: 'Client (system id)',
  clientName: 'Client name',
  siteId: 'Site (id)',
  siteName: 'Site name',
  location: 'Location description',
  locationLatitude: 'GPS latitude',
  locationLongitude: 'GPS longitude',
  timeOfDeparture: 'Departure time',
  timeOfArrival: 'Arrival on site',
  departureFromSite: 'Left site',
  arrivalBackAtOffice: 'Back at office',
  vehicleUsed: 'Vehicle',
  vehicleId: 'Vehicle (id)',
  kmReadingBefore: 'Odometer before',
  kmReadingAfter: 'Odometer after',
  travelKilometers: 'Travel distance',
  totalTimeMinutes: 'Total time on job',
  reasonForVisit: 'Reason for visit',
  callOutCategory: 'Call out category',
  diagnosis: 'Diagnosis',
  actionsTaken: 'Actions taken',
  futureWorkRequired: 'Future work',
  futureWorkScheduledAt: 'Future work scheduled',
  otherComments: 'Notes / customer details',
  photos: 'Photos & attachments',
  stockUsed: 'Stock used',
  materialsBought: 'Materials bought',
  totalMaterialsCost: 'Materials total cost',
  status: 'Status',
  submittedAt: 'Submitted time',
  completedAt: 'Completed time',
  ownerId: 'Owner (ERP user)',
  completedByUserId: 'Completed by (user id)',
  completedByName: 'Completed by (name)',
  jobCardNumber: 'Job card number',
  safetyCultureAuditId: 'SafetyCulture audit link',
  safetyCultureIssueId: 'SafetyCulture issue link',
  safetyCultureSnapshotJson: 'SafetyCulture snapshot',
  /** Service form instance (nested checklist) */
  answers: 'Form answers',
  templateName: 'Form template name',
  templateVersion: 'Form template version',
  templateId: 'Form template id',
  instanceId: 'Form instance id'
};

/**
 * How the activity was recorded (ERP vs field app).
 * @param {string} [source]
 * @returns {string}
 */
export function formatJobCardActivitySource(source) {
  if (!source || typeof source !== 'string') return '';
  const s = source.trim().toLowerCase();
  const map = {
    web: 'ERP (web)',
    'web_app': 'ERP (web)',
    public_api: 'Job card app (online)',
    sync: 'Job card app (synced)',
    mobile: 'Job card app',
    system: 'System'
  };
  return map[s] || source;
}

function humanizeUpdatedFields(fields) {
  if (!Array.isArray(fields) || fields.length === 0) return '';
  const labels = fields.map((f) =>
    typeof f === 'string' && JOB_CARD_FIELD_LABELS[f] ? JOB_CARD_FIELD_LABELS[f] : String(f)
  );
  const unique = [...new Set(labels)];
  const max = 16;
  if (unique.length <= max) {
    return unique.join(' · ');
  }
  return `${unique.slice(0, max).join(' · ')} · +${unique.length - max} more`;
}

const MAX_CHANGE_DETAIL_LINES = 32;

/**
 * @param {Array<{ field?: string, from?: unknown, to?: unknown }>} changes
 * @returns {string}
 */
function formatFieldChangeLines(changes) {
  if (!Array.isArray(changes) || changes.length === 0) return '';
  const lines = changes.map((c) => {
    const field = typeof c.field === 'string' ? c.field : '';
    const label = field && JOB_CARD_FIELD_LABELS[field] ? JOB_CARD_FIELD_LABELS[field] : field || 'Field';
    const from = c.from != null ? String(c.from) : '(empty)';
    const to = c.to != null ? String(c.to) : '(empty)';
    return `${label}: ${from} → ${to}`;
  });
  if (lines.length > MAX_CHANGE_DETAIL_LINES) {
    return `${lines.slice(0, MAX_CHANGE_DETAIL_LINES).join('\n')}\n… +${lines.length - MAX_CHANGE_DETAIL_LINES} more`;
  }
  return lines.join('\n');
}

/**
 * Human-readable primary line for a JobCardActivity.action value.
 * @param {string} action
 * @returns {string}
 */
export function formatJobCardActivityAction(action) {
  if (!action || typeof action !== 'string') return '—';
  const labels = {
    baseline_record: 'Baseline record',
    created: 'Created',
    updated: 'Updated',
    status_changed: 'Status changed',
    created_public: 'Created (public)',
    imported_from_safety_culture_audit: 'Imported (SafetyCulture audit)',
    imported_from_safety_culture_issue: 'Imported (SafetyCulture issue)',
    service_form_attached: 'Service form attached',
    service_form_updated: 'Service form updated',
    wizard_step_entered: 'Wizard step opened',
    wizard_media_added: 'Media added',
    service_form_attached_local: 'Checklist attached',
    service_form_removed: 'Checklist removed',
    stock_line_added: 'Stock line added',
    material_line_added: 'Material / cost line added',
    draft_saved_local: 'Draft saved on device',
    saved_local_pending_sync: 'Saved on device (pending sync)'
  };
  return labels[action] ?? action;
}

/**
 * Optional second line from metadata (short, no large payloads).
 * @param {string} action
 * @param {unknown} metadata
 * @returns {string}
 */
export function formatJobCardActivityDetail(action, metadata) {
  if (metadata == null || typeof metadata !== 'object') return '';
  const m = /** @type {Record<string, unknown>} */ (metadata);

  if (action === 'wizard_step_entered' && typeof m.stepId === 'string') {
    const title = JOB_CARD_ACTIVITY_STEP_LABELS[m.stepId] || m.stepId;
    return `Step: ${title}`;
  }
  if (action === 'wizard_media_added') {
    const kind = typeof m.kind === 'string' ? m.kind : '';
    const section = typeof m.section === 'string' ? m.section : '';
    const parts = [kind, section].filter(Boolean);
    return parts.length ? parts.join(' · ') : '';
  }
  if (action === 'stock_line_added') {
    const sku = typeof m.sku === 'string' ? m.sku : '';
    return sku ? `SKU: ${sku}` : '';
  }
  if (action === 'material_line_added') {
    const name = typeof m.itemName === 'string' ? m.itemName : '';
    return name ? name.slice(0, 80) : '';
  }
  if (action === 'service_form_attached_local' || action === 'service_form_removed') {
    const tid = typeof m.templateId === 'string' ? m.templateId : '';
    const tname = typeof m.templateName === 'string' ? m.templateName : '';
    if (tname) return tname.slice(0, 80);
    if (tid) return `Template: ${tid.slice(0, 40)}`;
  }
  if (action === 'status_changed' && m.from != null && m.to != null) {
    return `Status: ${String(m.from)} → ${String(m.to)}`;
  }
  if (action === 'created') {
    const parts = [];
    if (typeof m.jobCardNumber === 'string' && m.jobCardNumber.trim()) {
      parts.push(`Card #${m.jobCardNumber.trim()}`);
    }
    if (typeof m.clientName === 'string' && m.clientName.trim()) {
      parts.push(m.clientName.trim());
    }
    if (typeof m.siteName === 'string' && m.siteName.trim()) {
      parts.push(`Site: ${m.siteName.trim()}`);
    }
    if (m.status != null && String(m.status).trim() !== '') {
      parts.push(`Status: ${String(m.status)}`);
    }
    return parts.length ? parts.join(' · ') : '';
  }
  if (action === 'service_form_updated' && Array.isArray(m.changes) && m.changes.length > 0) {
    const formLabel =
      typeof m.templateName === 'string' && m.templateName.trim()
        ? `${m.templateName.trim()}\n`
        : '';
    return formLabel + formatFieldChangeLines(m.changes);
  }
  if (action === 'updated' && Array.isArray(m.changes) && m.changes.length > 0) {
    return formatFieldChangeLines(m.changes);
  }
  if (action === 'updated' && Array.isArray(m.fields)) {
    const summary = humanizeUpdatedFields(m.fields);
    return summary ? `Updated fields (no value diff stored): ${summary}` : '';
  }
  return '';
}

/**
 * Sort activity rows oldest-first for a chronological trail.
 * @param {Array<{ createdAt?: string }>} activities
 * @returns {Array<{ createdAt?: string }>}
 */
export function sortJobCardActivitiesChronological(activities) {
  if (!Array.isArray(activities)) return [];
  return [...activities].sort((a, b) => {
    const ta = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
    return ta - tb;
  });
}

const jobCardActivityHelpers = {
  formatJobCardActivityAction,
  formatJobCardActivityDetail,
  formatJobCardActivitySource,
  sortJobCardActivitiesChronological,
  JOB_CARD_ACTIVITY_STEP_LABELS,
  JOB_CARD_FIELD_LABELS,
  JOB_CARD_CALL_OUT_CATEGORY_OPTIONS
};

if (typeof window !== 'undefined') {
  window.jobCardActivityHelpers = jobCardActivityHelpers;
}
