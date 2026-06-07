/** Manufacturing tab ids — keep aligned with web `MANUFACTURING_TABS` in Manufacturing.jsx */
export type ManufacturingTabId =
  | 'dashboard'
  | 'inventory'
  | 'purchase'
  | 'bom'
  | 'production'
  | 'sales'
  | 'movements'
  | 'suppliers'
  | 'locations'
  | 'reports'
  | 'stock-count'
  | 'activity'

export type ManufacturingEntryKind = 'web' | 'native'

export type ManufacturingEntry = {
  id: ManufacturingTabId | 'job-cards' | 'field-stock-take'
  label: string
  subtitle: string
  icon: string
  kind: ManufacturingEntryKind
  adminOnly?: boolean
  /** Web ERP path segment after `/manufacturing` (omit for dashboard). */
  webTab?: ManufacturingTabId
}

export const MANUFACTURING_WEB_TABS: ManufacturingTabId[] = [
  'dashboard',
  'inventory',
  'purchase',
  'bom',
  'production',
  'sales',
  'movements',
  'suppliers',
  'locations',
  'reports',
  'stock-count',
  'activity'
]

/** Hub entries mirroring web Manufacturing navigation + native field workflows. */
export function getManufacturingEntries(isAdmin: boolean): ManufacturingEntry[] {
  const entries: ManufacturingEntry[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      subtitle: 'KPIs, low stock, production stats',
      icon: 'chart-bar',
      kind: 'web',
      webTab: 'dashboard'
    },
    {
      id: 'inventory',
      label: 'Inventory',
      subtitle: 'SKU catalog, per-site qty, labels & QR',
      icon: 'boxes',
      kind: 'web',
      webTab: 'inventory'
    },
    {
      id: 'purchase',
      label: 'Purchase Orders',
      subtitle: 'PO lifecycle, goods receipt, returns',
      icon: 'file-invoice-dollar',
      kind: 'web',
      webTab: 'purchase'
    },
    {
      id: 'bom',
      label: 'Bill of Materials',
      subtitle: 'BOM groups and component costing',
      icon: 'clipboard-list',
      kind: 'web',
      webTab: 'bom'
    },
    {
      id: 'production',
      label: 'Production Orders',
      subtitle: 'Work orders, BOM consume, completion',
      icon: 'industry',
      kind: 'web',
      webTab: 'production'
    },
    {
      id: 'sales',
      label: 'Sales Orders',
      subtitle: 'Create, edit, ship and deduct stock',
      icon: 'shopping-cart',
      kind: 'web',
      webTab: 'sales'
    },
    {
      id: 'movements',
      label: 'Stock Movements',
      subtitle: 'Ledger receipts, transfers, adjustments',
      icon: 'exchange-alt',
      kind: 'web',
      webTab: 'movements'
    },
    {
      id: 'suppliers',
      label: 'Suppliers',
      subtitle: 'Supplier master linked to inventory',
      icon: 'truck',
      kind: 'web',
      webTab: 'suppliers'
    },
    {
      id: 'locations',
      label: 'Stock Locations',
      subtitle: 'Warehouses and site bins',
      icon: 'map-marker-alt',
      kind: 'web',
      webTab: 'locations'
    },
    {
      id: 'reports',
      label: 'Reports',
      subtitle: 'Movements, valuation, allocations',
      icon: 'file-alt',
      kind: 'web',
      webTab: 'reports'
    },
    {
      id: 'job-cards',
      label: 'Job cards',
      subtitle: 'Field visits, stock used, sign-off',
      icon: 'clipboard-check',
      kind: 'native'
    },
    {
      id: 'field-stock-take',
      label: 'Field stock take',
      subtitle: 'Location count with QR scan (native)',
      icon: 'barcode',
      kind: 'native'
    }
  ]

  if (isAdmin) {
    entries.push(
      {
        id: 'stock-count',
        label: 'Stock count',
        subtitle: 'Admin stocktake sessions & apply',
        icon: 'clipboard-list',
        kind: 'web',
        webTab: 'stock-count',
        adminOnly: true
      },
      {
        id: 'activity',
        label: 'Activity',
        subtitle: 'Manufacturing audit log',
        icon: 'history',
        kind: 'web',
        webTab: 'activity',
        adminOnly: true
      }
    )
  }

  return entries
}

export function normalizeManufacturingTab(value: string | null | undefined): ManufacturingTabId {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return MANUFACTURING_WEB_TABS.includes(normalized as ManufacturingTabId)
    ? (normalized as ManufacturingTabId)
    : 'dashboard'
}

export function manufacturingWebPath(
  tab: ManufacturingTabId,
  query?: Record<string, string | undefined>
): string {
  const base = tab === 'dashboard' ? '/manufacturing' : `/manufacturing/${tab}`
  if (!query) return base
  const params = new URLSearchParams()
  for (const [key, val] of Object.entries(query)) {
    if (val != null && val !== '') params.set(key, val)
  }
  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}

export function parseManufacturingLink(link: string): {
  tab: ManufacturingTabId
  query: Record<string, string>
} {
  const raw = String(link || '').trim()
  const pathPart = raw.includes('#') ? raw.split('#').slice(1).join('#') : raw
  const normalized = pathPart.startsWith('/') ? pathPart : `/${pathPart}`
  const qIdx = normalized.indexOf('?')
  const path = qIdx >= 0 ? normalized.slice(0, qIdx) : normalized
  const queryStr = qIdx >= 0 ? normalized.slice(qIdx + 1) : ''
  const params = new URLSearchParams(queryStr)
  const query: Record<string, string> = {}
  params.forEach((v, k) => {
    query[k] = v
  })

  const segments = path.replace(/^\//, '').split('/').filter(Boolean)
  if ((segments[0] || '').toLowerCase() !== 'manufacturing') {
    return { tab: 'dashboard', query }
  }
  return { tab: normalizeManufacturingTab(segments[1]), query }
}
