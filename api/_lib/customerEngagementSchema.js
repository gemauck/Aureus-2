/** @type {1} */
export const CUSTOMER_ENGAGEMENT_SCHEMA_VERSION = 1

const MAX_PHOTO_COUNT = 8
const MAX_PHOTO_CHARS = 900_000
const MAX_TEXT = 8000
const ALLOWED_CUSTOM_FIELD_TYPES = new Set(['text', 'textarea', 'date'])

function toSafeFieldId(seed, fallback) {
  const s = String(seed || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return s || fallback
}

export function sanitizeCustomerEngagementCustomFields(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  const seen = new Set()
  for (let i = 0; i < raw.length; i++) {
    const f = raw[i]
    if (!f || typeof f !== 'object') continue
    const label = String(f.label || '').trim()
    if (!label) continue
    const type = String(f.type || 'text').trim().toLowerCase()
    if (!ALLOWED_CUSTOM_FIELD_TYPES.has(type)) continue
    const id = `custom.${toSafeFieldId(f.id || label, `field_${i + 1}`)}`
    if (seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      type,
      label: label.slice(0, 160),
      required: f.required === true,
      maxLength:
        type === 'date'
          ? 40
          : Math.max(40, Math.min(MAX_TEXT, parseInt(f.maxLength, 10) || 400)),
      placeholder: typeof f.placeholder === 'string' ? f.placeholder.slice(0, 200) : '',
      hint: typeof f.hint === 'string' ? f.hint.slice(0, 280) : ''
    })
  }
  return out
}

/**
 * Form sections for the public questionnaire (matches site-visit Word template).
 * Field keys are stable for stored JSON.
 */
export function getCustomerEngagementFormDefinition(customFields = []) {
  const def = {
    schemaVersion: CUSTOMER_ENGAGEMENT_SCHEMA_VERSION,
    title: 'Site visit / Customer engagement questionnaire',
    sections: [
      {
        id: 'general',
        heading: 'General information',
        fields: [
          { id: 'general.siteVisitDate', type: 'date', label: 'Date of site visit', required: false },
          {
            id: 'general.clientName',
            type: 'text',
            label: 'Name of client',
            required: true,
            maxLength: 300,
            placeholder: 'Legal or trading name'
          },
          {
            id: 'general.siteName',
            type: 'text',
            label: 'Name of site',
            required: false,
            maxLength: 300,
            placeholder: 'Site or farm name'
          },
          {
            id: 'general.operationType',
            type: 'text',
            label: 'Type of operation',
            required: false,
            maxLength: 300,
            placeholder: 'e.g. Agriculture, Mining, Logistics'
          },
          {
            id: 'general.siteLocation',
            type: 'textarea',
            label: 'Site location',
            required: false,
            maxLength: MAX_TEXT,
            hint: 'Distance to nearest town and/or GPS coordinates'
          },
          {
            id: 'general.attendees',
            type: 'textarea',
            label: 'Attendees / agents',
            required: false,
            maxLength: 2000
          },
          {
            id: 'general.serviceTypes',
            type: 'checkboxGroup',
            label: 'Type of service required',
            required: false,
            hint: 'Select all that apply',
            options: [
              { id: 'fuelManagement', label: 'Fuel management services' },
              { id: 'assetTracking', label: 'Asset tracking' },
              { id: 'dieselRefund', label: 'Diesel refund services' },
              { id: 'historicalAudit', label: 'Historical audit services' }
            ]
          }
        ]
      },
      {
        id: 'commercial',
        heading: 'Commercial',
        fields: [
          {
            id: 'commercial.dieselSupplierUsage',
            type: 'textarea',
            label: 'Diesel supplier and fuel usage',
            required: false,
            maxLength: MAX_TEXT,
            hint: 'Supplier name and litres pumped monthly (approx.)'
          },
          {
            id: 'commercial.bbbeeRequired',
            type: 'textarea',
            label: 'BBBEE required?',
            required: false,
            maxLength: 2000,
            hint: 'Yes / No and any implications (e.g. proposal routing)'
          },
          {
            id: 'commercial.additionalComments',
            type: 'textarea',
            label: 'Additional comments and observations',
            required: false,
            maxLength: MAX_TEXT,
            hint: 'Anything not covered above'
          }
        ]
      },
      {
        id: 'technical',
        heading: 'Technical',
        fields: [
          {
            id: 'technical.dispensingPointsCount',
            type: 'text',
            label: 'How many dispensing points on site?',
            required: false,
            maxLength: 80
          },
          {
            id: 'technical.dispensingPointTypes',
            type: 'textarea',
            label: 'Types of dispensing point',
            required: false,
            maxLength: 2000,
            hint: 'Type of meters / pumps'
          },
          {
            id: 'technical.tankLayout',
            type: 'textarea',
            label: 'Tank setup layout',
            required: false,
            maxLength: 2000,
            hint: 'Number and location of tanks'
          },
          {
            id: 'technical.equipmentPhotos',
            type: 'fileList',
            label: 'Pictures of equipment',
            required: false,
            hint: `Up to ${MAX_PHOTO_COUNT} images (PNG/JPEG), each under ~700KB when encoded`
          },
          {
            id: 'technical.mobileBowsers',
            type: 'textarea',
            label: 'Mobile bowsers',
            required: false,
            maxLength: 2000,
            hint: 'Yes / No — include number, sizes, contractors if applicable'
          },
          {
            id: 'technical.fleetAssetCount',
            type: 'text',
            label: 'Number of assets on fleet',
            required: false,
            maxLength: 80
          }
        ]
      },
      {
        id: 'data',
        heading: 'Data',
        fields: [
          {
            id: 'data.dispenseRecordingSystem',
            type: 'textarea',
            label: 'What system records dispenses on site?',
            required: false,
            maxLength: MAX_TEXT
          },
          {
            id: 'data.assetActivityRecording',
            type: 'textarea',
            label: 'How are asset activities recorded?',
            required: false,
            maxLength: MAX_TEXT,
            hint: 'GPS or other systems in place?'
          },
          {
            id: 'data.controlRoom',
            type: 'textarea',
            label: 'Control room for asset activity?',
            required: false,
            maxLength: 2000
          },
          {
            id: 'data.currentRefundClaims',
            type: 'textarea',
            label: 'Current diesel refund claims',
            required: false,
            maxLength: MAX_TEXT,
            hint: 'What is claimed and how is the refund calculated?'
          },
          {
            id: 'data.retentionPeriod',
            type: 'textarea',
            label: 'How long is information stored on site?',
            required: false,
            maxLength: 2000
          }
        ]
      },
      {
        id: 'compliance',
        heading: 'Diesel refund compliance',
        fields: [
          {
            id: 'compliance.miningRight',
            type: 'textarea',
            label: 'Is there a valid mining right?',
            required: false,
            maxLength: 2000
          },
          {
            id: 'compliance.vatDieselRefundReg',
            type: 'textarea',
            label: 'VAT and diesel refund registration',
            required: false,
            maxLength: 2000,
            hint: 'Registered for VAT and diesel refund? Current status'
          },
          {
            id: 'compliance.claimingHistoricAudits',
            type: 'textarea',
            label: 'Currently claiming / historic audits',
            required: false,
            maxLength: MAX_TEXT
          },
          {
            id: 'compliance.contractorsWetDry',
            type: 'textarea',
            label: 'Contractors on site',
            required: false,
            maxLength: 2000,
            hint: 'Wet / dry contracts; who supplies diesel?'
          },
          {
            id: 'compliance.dieselControlLosses',
            type: 'textarea',
            label: 'Client control of diesel / losses',
            required: false,
            maxLength: 2000
          }
        ]
      }
    ]
  }
  const extra = sanitizeCustomerEngagementCustomFields(customFields)
  if (extra.length > 0) {
    def.sections.push({
      id: 'custom',
      heading: 'Additional information',
      fields: extra
    })
  }
  return def
}

export function flattenFieldDefs(formDef) {
  const def = formDef && Array.isArray(formDef.sections) ? formDef : getCustomerEngagementFormDefinition()
  const out = []
  for (const sec of def.sections) {
    for (const f of sec.fields) {
      out.push({ ...f, sectionId: sec.id })
    }
  }
  return out
}

export function validateCustomerEngagementResponses(responses, formDef) {
  const errors = []
  if (!responses || typeof responses !== 'object') {
    return { ok: false, errors: ['Invalid submission payload'] }
  }

  const fields = flattenFieldDefs(formDef)
  for (const f of fields) {
    const v = responses[f.id]
    if (f.required && (v === undefined || v === null || String(v).trim() === '')) {
      errors.push(`Missing required field: ${f.label}`)
      continue
    }
    if (v === undefined || v === null) continue

    if (f.type === 'checkboxGroup') {
      if (typeof v !== 'object' || Array.isArray(v)) {
        errors.push(`Invalid value for: ${f.label}`)
        continue
      }
      const allowed = new Set((f.options || []).map((o) => o.id))
      for (const k of Object.keys(v)) {
        if (!allowed.has(k)) continue
        if (typeof v[k] !== 'boolean') {
          errors.push(`Invalid checkbox value for: ${f.label}`)
          break
        }
      }
      continue
    }

    if (f.type === 'fileList') {
      if (!Array.isArray(v)) {
        errors.push(`Invalid photos for: ${f.label}`)
        continue
      }
      if (v.length > MAX_PHOTO_COUNT) {
        errors.push(`Too many photos (max ${MAX_PHOTO_COUNT})`)
      }
      let total = 0
      for (let i = 0; i < v.length; i++) {
        const item = v[i]
        if (!item || typeof item !== 'object') {
          errors.push(`Invalid photo entry ${i + 1}`)
          continue
        }
        const dataUrl = typeof item.dataUrl === 'string' ? item.dataUrl : ''
        const name = typeof item.name === 'string' ? item.name : `photo-${i + 1}`
        if (dataUrl && !/^data:image\/(png|jpeg|jpg);base64,/i.test(dataUrl)) {
          errors.push(`Photo "${name}" must be PNG or JPEG data URL`)
        }
        total += dataUrl.length
      }
      if (total > MAX_PHOTO_CHARS) {
        errors.push('Total image payload too large — remove or compress images')
      }
      continue
    }

    if (typeof v !== 'string') {
      errors.push(`Invalid value for: ${f.label}`)
      continue
    }
    const maxLen = f.maxLength || MAX_TEXT
    if (v.length > maxLen) {
      errors.push(`“${f.label}” exceeds maximum length`)
    }
  }

  return { ok: errors.length === 0, errors }
}

export function buildEmptyResponses(formDef) {
  const o = {}
  for (const f of flattenFieldDefs(formDef)) {
    if (f.type === 'checkboxGroup') {
      o[f.id] = {}
      for (const opt of f.options || []) {
        o[f.id][opt.id] = false
      }
    } else if (f.type === 'fileList') {
      o[f.id] = []
    } else {
      o[f.id] = ''
    }
  }
  return o
}

/**
 * Admin-supplied defaults for the public form (no fileList). Null clears stored prefill.
 */
export function sanitizeCustomerEngagementPrefill(raw, formDef) {
  if (raw === null) return null
  if (raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) return null

  const fields = flattenFieldDefs(formDef)
  const byId = new Map(fields.map((f) => [f.id, f]))
  const out = {}

  for (const [k, v] of Object.entries(raw)) {
    const f = byId.get(k)
    if (!f || f.type === 'fileList') continue

    if (f.type === 'checkboxGroup') {
      if (typeof v !== 'object' || v === null || Array.isArray(v)) continue
      const allowed = new Set((f.options || []).map((opt) => opt.id))
      const checked = {}
      for (const oid of allowed) {
        if (v[oid] === true) checked[oid] = true
      }
      if (Object.keys(checked).length > 0) out[k] = checked
      continue
    }

    if (typeof v !== 'string') continue
    const maxLen = f.maxLength || MAX_TEXT
    const s = v.trim() === '' ? '' : v.slice(0, maxLen)
    if (s !== '') out[k] = s
  }

  return Object.keys(out).length > 0 ? out : null
}

/**
 * Full initial response object for the public GET (empty + stored prefill + lead name for client field).
 */
export function buildInitialResponsesForPublic(storedPrefillRaw, leadName, formDef) {
  const base = buildEmptyResponses(formDef)
  const sanitized = sanitizeCustomerEngagementPrefill(storedPrefillRaw, formDef)
  if (sanitized) {
    for (const [k, v] of Object.entries(sanitized)) {
      if (base[k] === undefined) continue
      if (typeof base[k] === 'object' && base[k] !== null && !Array.isArray(base[k]) && v && typeof v === 'object' && !Array.isArray(v)) {
        base[k] = { ...base[k], ...v }
      } else if (!Array.isArray(base[k])) {
        base[k] = v
      }
    }
  }
  const name = String(leadName || '').trim()
  if (name && !String(base['general.clientName'] || '').trim()) {
    base['general.clientName'] = name
  }
  return base
}
