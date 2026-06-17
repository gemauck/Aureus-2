import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppState, Platform } from 'react-native'
import Constants from 'expo-constants'
import * as Updates from 'expo-updates'
import { apiUrl } from '../config'
import { getMobileClientInfo } from './clientPresence'

const SECTION = 'mobile-app'
const PENDING_KEY = 'mobile_error_reports_pending_v1'
const DEDUP_KEY = 'mobile_error_reports_dedup_v1'

const MAX_BREADCRUMBS = 25
const MAX_PENDING = 40
const MAX_SESSION_REPORTS = 30
const META_STACK_MAX = 8000

type ErrorCategory = 'crash' | 'api' | 'functionality'

type Breadcrumb = {
  ts: string
  type: 'navigation' | 'api' | 'action' | 'info'
  message: string
  data?: Record<string, unknown>
}

type PendingReport = {
  message: string
  pageUrl: string
  type: 'bug'
  severity: 'low' | 'medium' | 'high'
  meta: Record<string, unknown>
  fingerprint: string
  createdAt: string
}

type DedupEntry = { at: number; count: number }

let breadcrumbs: Breadcrumb[] = []
let currentScreen = 'App'
let accessTokenGetter: (() => string | null) | null = null
let sessionReportCount = 0
let flushInFlight: Promise<void> | null = null
let appStateSub: { remove: () => void } | null = null

export function registerErrorReportAuth(getter: () => string | null): void {
  accessTokenGetter = getter
}

export function initErrorReporting(): void {
  if (appStateSub) return
  appStateSub = AppState.addEventListener('change', (state) => {
    if (state === 'active') void flushPendingReports()
  })
  void flushPendingReports()
}

export function setErrorReportScreen(screen: string): void {
  const next = String(screen || '').trim() || 'App'
  if (next === currentScreen) return
  currentScreen = next
  addBreadcrumb('navigation', `Screen: ${next}`)
}

export function addBreadcrumb(
  type: Breadcrumb['type'],
  message: string,
  data?: Record<string, unknown>
): void {
  breadcrumbs.push({
    ts: new Date().toISOString(),
    type,
    message: String(message).slice(0, 500),
    ...(data ? { data } : {})
  })
  if (breadcrumbs.length > MAX_BREADCRUMBS) {
    breadcrumbs = breadcrumbs.slice(-MAX_BREADCRUMBS)
  }
}

function hashFingerprint(parts: string[]): string {
  const raw = parts.join('|')
  let h = 0
  for (let i = 0; i < raw.length; i++) {
    h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0
  }
  return `fp_${Math.abs(h).toString(36)}`
}

function stackTop(stack?: string): string {
  if (!stack) return ''
  return stack
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(' / ')
}

function inferCategory(context: string): ErrorCategory {
  if (context === 'ErrorBoundary' || context === 'GlobalFatal') return 'crash'
  if (context.startsWith('api:')) return 'api'
  return 'functionality'
}

function inferSeverity(category: ErrorCategory, context: string, statusCode?: number): PendingReport['severity'] {
  if (category === 'crash' || context === 'GlobalFatal' || context === 'ErrorBoundary') return 'high'
  if (category === 'api') {
    if (!statusCode || statusCode >= 500 || statusCode === 0) return 'high'
    if (statusCode === 401 || statusCode === 403) return 'low'
    if (statusCode >= 400) return 'medium'
    return 'medium'
  }
  if (context.startsWith('useErpQuery:')) return 'medium'
  if (context === 'authRefresh' || context === 'loadSession') return 'low'
  return 'medium'
}

function shouldSkipReport(context: string, statusCode?: number): boolean {
  if (context === 'mobileLogout') return true
  if (context.startsWith('api:') && statusCode === 401) return true
  return false
}

function collectDeviceContext() {
  const mobile = getMobileClientInfo()
  return {
    ...mobile,
    osVersion: String(Platform.Version),
    deviceName: Constants.deviceName || undefined,
    isDevice: Constants.isDevice,
    isEmbeddedLaunch: Updates.isEmbeddedLaunch,
    channel: Updates.channel || undefined
  }
}

function buildErrorMeta(
  error: unknown,
  context: string,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  const err = error instanceof Error ? error : new Error(String(error))
  const stack =
    typeof err.stack === 'string' ? err.stack.slice(0, META_STACK_MAX) : undefined
  const category = inferCategory(context)

  return {
    source: SECTION,
    category,
    context,
    screen: currentScreen,
    fingerprint: hashFingerprint([category, context, err.message, stackTop(stack)]),
    device: collectDeviceContext(),
    error: {
      name: err.name,
      message: err.message,
      stack
    },
    ...(typeof extra?.componentStack === 'string'
      ? { componentStack: extra.componentStack.slice(0, 4000) }
      : {}),
    breadcrumbs: [...breadcrumbs],
    ...extra
  }
}

function formatReportMessage(
  category: ErrorCategory,
  context: string,
  message: string,
  extra?: Record<string, unknown>
): string {
  const label =
    category === 'crash'
      ? 'Crash'
      : category === 'api'
        ? 'API error'
        : 'Functionality issue'
  const api = extra?.api as { method?: string; path?: string; statusCode?: number } | undefined
  const apiBit =
    api?.method && api?.path
      ? ` — ${api.method} ${api.path}${api.statusCode ? ` (${api.statusCode})` : ''}`
      : ''
  return `[Mobile App — ${label}] ${message}\nContext: ${context}${apiBit}\nScreen: ${currentScreen}`
}

async function loadDedupMap(): Promise<Record<string, DedupEntry>> {
  try {
    const raw = await AsyncStorage.getItem(DEDUP_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, DedupEntry>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

async function saveDedupMap(map: Record<string, DedupEntry>): Promise<void> {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  const pruned: Record<string, DedupEntry> = {}
  for (const [key, entry] of Object.entries(map)) {
    if (entry?.at && entry.at >= cutoff) pruned[key] = entry
  }
  await AsyncStorage.setItem(DEDUP_KEY, JSON.stringify(pruned))
}

function dedupCooldownMs(category: ErrorCategory, context: string): number {
  if (category === 'crash') return 15 * 60 * 1000
  if (category === 'api') return 60 * 60 * 1000
  if (context === 'authRefresh') return 2 * 60 * 60 * 1000
  return 30 * 60 * 1000
}

async function isDuplicate(fingerprint: string, category: ErrorCategory, context: string): Promise<boolean> {
  const map = await loadDedupMap()
  const entry = map[fingerprint]
  if (!entry) return false
  return Date.now() - entry.at < dedupCooldownMs(category, context)
}

async function markReported(fingerprint: string): Promise<void> {
  const map = await loadDedupMap()
  const prev = map[fingerprint]
  map[fingerprint] = { at: Date.now(), count: (prev?.count || 0) + 1 }
  await saveDedupMap(map)
}

async function loadPending(): Promise<PendingReport[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as PendingReport[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function savePending(items: PendingReport[]): Promise<void> {
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(items.slice(-MAX_PENDING)))
}

async function postReport(report: PendingReport, token: string): Promise<boolean> {
  const response = await fetch(apiUrl('/api/feedback'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      message: report.message,
      pageUrl: report.pageUrl,
      section: SECTION,
      type: report.type,
      severity: report.severity,
      meta: report.meta
    })
  })
  return response.ok
}

export async function flushPendingReports(): Promise<void> {
  if (flushInFlight) return flushInFlight
  flushInFlight = (async () => {
    const token = accessTokenGetter?.() || null
    if (!token) return

    const pending = await loadPending()
    if (!pending.length) return

    const remaining: PendingReport[] = []
    for (const item of pending) {
      try {
        const ok = await postReport(item, token)
        if (!ok) remaining.push(item)
      } catch {
        remaining.push(item)
      }
    }
    await savePending(remaining)
  })().finally(() => {
    flushInFlight = null
  })
  return flushInFlight
}

async function enqueueReport(report: PendingReport): Promise<void> {
  const token = accessTokenGetter?.() || null
  if (token) {
    try {
      const ok = await postReport(report, token)
      if (ok) return
    } catch {
      /* queue below */
    }
  }
  const pending = await loadPending()
  pending.push(report)
  await savePending(pending)
}

export async function reportError(error: unknown, context: string, extra?: Record<string, unknown>): Promise<void> {
  try {
    const statusCode =
      typeof extra?.statusCode === 'number'
        ? extra.statusCode
        : typeof (error as { statusCode?: number })?.statusCode === 'number'
          ? (error as { statusCode: number }).statusCode
          : undefined

    if (shouldSkipReport(context, statusCode)) return
    if (sessionReportCount >= MAX_SESSION_REPORTS) return

    const err = error instanceof Error ? error : new Error(String(error))
    const category = inferCategory(context)
    const meta = buildErrorMeta(err, context, extra)
    const fingerprint = String(meta.fingerprint || hashFingerprint([category, context, err.message]))

    if (await isDuplicate(fingerprint, category, context)) return

    const severity = inferSeverity(category, context, statusCode)
    const report: PendingReport = {
      message: formatReportMessage(category, context, err.message, extra),
      pageUrl: `mobile://${currentScreen}`,
      type: 'bug',
      severity,
      meta,
      fingerprint,
      createdAt: new Date().toISOString()
    }

    sessionReportCount += 1
    await markReported(fingerprint)
    await enqueueReport(report)
    void flushPendingReports()
  } catch {
    /* never throw from reporter */
  }
}

export function reportApiError(
  path: string,
  method: string,
  statusCode: number,
  message: string
): void {
  const ctx = `api:${method}:${path}`
  addBreadcrumb('api', `${method} ${path} → ${statusCode}`, { path, method, statusCode })
  const error = Object.assign(new Error(message || `HTTP ${statusCode}`), { statusCode })
  void reportError(error, ctx, {
    api: { path, method, statusCode },
    statusCode
  })
}
