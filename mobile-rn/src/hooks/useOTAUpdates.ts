import { useCallback, useEffect, useRef } from 'react'
import { Alert, AppState, Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Updates from 'expo-updates'
import { isApkUpdateRequired, waitForApkVersionCheck } from '../services/apkUpdateUi'
import { setOtaUiPhase } from '../services/otaUpdateUi'
import { trackError } from '../services/telemetry'

const FOREGROUND_DEBOUNCE_MS = 30_000
const BACKGROUND_POLL_MS = 5 * 60_000
const PROMPT_COOLDOWN_MS = 3 * 60_000
const APPLY_BRIEF_MS = 700
const RELOAD_GUARD_KEY = '@ota_reload_guard_v1'
const RELOAD_GUARD_MS = 10 * 60_000

export type OtaCheckResult =
  | { status: 'dev' | 'disabled' | 'unsupported' | 'current' }
  | { status: 'downloaded'; willReload: boolean }
  | { status: 'error'; message: string }

type OtaSyncMode = 'auto' | 'prompt' | 'background'

let lastPromptedUpdateId: string | null = null
let lastPromptedAt = 0
let pendingOtaUpdateId: string | null = null

/** Allow the restart prompt again after the app returns from background. */
export function resetOtaPromptCooldown() {
  lastPromptedUpdateId = null
  lastPromptedAt = 0
}

function otaDisabled(): OtaCheckResult | null {
  if (__DEV__) return { status: 'dev' }
  if (Platform.OS !== 'android') return { status: 'unsupported' }
  if (!Updates.isEnabled) return { status: 'disabled' }
  return null
}

function formatOtaError(error: unknown, context: string): OtaCheckResult {
  const raw = error instanceof Error ? error.message : String(error)
  trackError(error, context)
  const message =
    /404|unsupported runtime|no ota bundles|no update/i.test(raw)
      ? `No JS bundle on the server for runtime ${Updates.runtimeVersion || 'unknown'}. Deploy and run npm run mobile:ota:publish on the server.`
      : raw
  return { status: 'error', message }
}

async function readReloadGuard(): Promise<{ updateId: string; at: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(RELOAD_GUARD_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { updateId?: string; at?: number }
    if (!parsed?.updateId || typeof parsed.at !== 'number') return null
    return { updateId: parsed.updateId, at: parsed.at }
  } catch {
    return null
  }
}

async function markReloadAttempt(updateId: string) {
  try {
    await AsyncStorage.setItem(
      RELOAD_GUARD_KEY,
      JSON.stringify({ updateId, at: Date.now() })
    )
  } catch {
    /* ignore */
  }
}

async function clearReloadGuard() {
  try {
    await AsyncStorage.removeItem(RELOAD_GUARD_KEY)
  } catch {
    /* ignore */
  }
}

/** Stop reload loops when a bundle was already fetched but never became active. */
async function shouldSkipAutoReload(
  updateId: string,
  runningId: string | null | undefined
): Promise<boolean> {
  if (runningId && runningId === updateId) {
    await clearReloadGuard()
    return true
  }
  const guard = await readReloadGuard()
  if (!guard) return false
  if (guard.updateId !== updateId) return false
  return Date.now() - guard.at < RELOAD_GUARD_MS
}

function promptApplyUpdate(updateId?: string | null): Promise<OtaCheckResult> {
  const now = Date.now()
  if (
    updateId &&
    lastPromptedUpdateId === updateId &&
    now - lastPromptedAt < PROMPT_COOLDOWN_MS
  ) {
    return Promise.resolve({ status: 'downloaded', willReload: false })
  }
  if (updateId) {
    lastPromptedUpdateId = updateId
    lastPromptedAt = now
  }

  return new Promise((resolve) => {
    Alert.alert(
      'Update ready',
      'A new version is ready. Restart now to apply it? Draft job cards are saved on this device.',
      [
        {
          text: 'Later',
          style: 'cancel',
          onPress: () => resolve({ status: 'downloaded', willReload: false })
        },
        {
          text: 'Restart',
          onPress: () => {
            pendingOtaUpdateId = null
            void Updates.reloadAsync()
            resolve({ status: 'downloaded', willReload: true })
          }
        }
      ]
    )
  })
}

function markDownloadedOtaUpdate(updateId?: string | null): OtaCheckResult {
  const id = updateId || 'pending'
  pendingOtaUpdateId = id
  if (AppState.currentState === 'active') {
    void promptApplyUpdate(id)
  }
  return { status: 'downloaded', willReload: false }
}

async function reloadWithApplyingUi(updateId: string): Promise<OtaCheckResult> {
  setOtaUiPhase('applying')
  pendingOtaUpdateId = null
  await markReloadAttempt(updateId)
  await new Promise((resolve) => setTimeout(resolve, APPLY_BRIEF_MS))
  await Updates.reloadAsync()
  return { status: 'downloaded', willReload: true }
}

/**
 * Sync OTA state with the server.
 * Only treat server-reported updates (check.isAvailable + fetch.isNew) as apply-ready —
 * never auto-reload on stale staged bundles (that caused restart loops back to Dashboard).
 */
export async function syncOtaUpdate(
  options: { mode?: OtaSyncMode } = {}
): Promise<OtaCheckResult> {
  const blocked = otaDisabled()
  if (blocked) return blocked

  const mode = options.mode || 'background'

  try {
    if (mode === 'auto') setOtaUiPhase('checking')

    const check = await Updates.checkForUpdateAsync()
    if (!check.isAvailable) {
      if (mode === 'auto') setOtaUiPhase('idle')
      return { status: 'current' }
    }

    if (mode === 'auto') setOtaUiPhase('downloading')
    const fetchResult = await Updates.fetchUpdateAsync()

    const downloadedId = fetchResult?.manifest?.id ?? null
    const runningId = Updates.updateId ?? null

    if (!fetchResult?.isNew || !downloadedId) {
      if (mode === 'auto') setOtaUiPhase('idle')
      return { status: 'current' }
    }

    if (runningId === downloadedId) {
      await clearReloadGuard()
      if (mode === 'auto') setOtaUiPhase('idle')
      return { status: 'current' }
    }

    if (mode === 'auto') {
      if (await shouldSkipAutoReload(downloadedId, runningId)) {
        setOtaUiPhase('idle')
        return promptApplyUpdate(downloadedId)
      }
      return reloadWithApplyingUi(downloadedId)
    }

    if (mode === 'prompt') {
      return promptApplyUpdate(downloadedId)
    }

    return markDownloadedOtaUpdate(downloadedId)
  } catch (error) {
    if (mode === 'auto') setOtaUiPhase('idle')
    return formatOtaError(error, 'OTA sync')
  }
}

/** Download a newer bundle in the background — user chooses when to restart. */
export async function prefetchOtaUpdate(): Promise<OtaCheckResult> {
  return syncOtaUpdate({ mode: 'background' })
}

/** Fetch a newer JS bundle without reloading — for manual download from Settings. */
export async function downloadOtaUpdate(): Promise<OtaCheckResult> {
  return syncOtaUpdate({ mode: 'prompt' })
}

/** Push nudge from admin Users page — download and prompt (no forced reload loop). */
export async function handleRemoteOtaNudge(): Promise<OtaCheckResult> {
  return syncOtaUpdate({ mode: 'prompt' })
}

export async function applyOtaUpdate(
  options: { silent?: boolean; reload?: boolean; prompt?: boolean } = {}
): Promise<OtaCheckResult> {
  const blocked = otaDisabled()
  if (blocked) return blocked

  if (options.reload === true) {
    try {
      const check = await Updates.checkForUpdateAsync()
      if (!check.isAvailable) {
        const runningId = Updates.updateId
        if (runningId) {
          setOtaUiPhase('applying')
          pendingOtaUpdateId = null
          await new Promise((resolve) => setTimeout(resolve, APPLY_BRIEF_MS))
          await Updates.reloadAsync()
          return { status: 'downloaded', willReload: true }
        }
        return { status: 'current' }
      }
      const fetchResult = await Updates.fetchUpdateAsync()
      const downloadedId = fetchResult?.manifest?.id
      if (!downloadedId) return { status: 'current' }
      if (options.prompt) return promptApplyUpdate(downloadedId)
      return reloadWithApplyingUi(downloadedId)
    } catch (error) {
      setOtaUiPhase('idle')
      return formatOtaError(error, 'OTA apply')
    }
  }

  return syncOtaUpdate({
    mode: options.prompt ? 'prompt' : options.silent === false ? 'prompt' : 'background'
  })
}

/** OTA sync on app open (once per session auto-apply) and periodic background checks. */
export function useOTAUpdates(enabled = true) {
  const inFlightRef = useRef(false)
  const lastCheckRef = useRef(0)
  const appStateRef = useRef(AppState.currentState)
  const sessionAutoDoneRef = useRef(false)

  const runOpenCheck = useCallback(
    async (opts: { force?: boolean; autoApply?: boolean } = {}) => {
      if (!enabled && !opts.force) return { status: 'current' as const }

      const now = Date.now()
      if (!opts.force && now - lastCheckRef.current < FOREGROUND_DEBOUNCE_MS) {
        return { status: 'current' as const }
      }
      if (inFlightRef.current) return { status: 'current' as const }

      inFlightRef.current = true
      lastCheckRef.current = now
      try {
        const apkState = await waitForApkVersionCheck()
        if (apkState === 'required' || isApkUpdateRequired()) {
          return { status: 'current' as const }
        }

        const allowAuto = opts.autoApply === true && !sessionAutoDoneRef.current
        if (allowAuto) sessionAutoDoneRef.current = true

        return await syncOtaUpdate({ mode: allowAuto ? 'auto' : 'background' })
      } finally {
        inFlightRef.current = false
      }
    },
    [enabled]
  )

  const check = useCallback(
    async (opts: { silent?: boolean; force?: boolean } = {}) => {
      if (!enabled && !opts.force) return { status: 'current' as const }

      const now = Date.now()
      if (!opts.force && now - lastCheckRef.current < FOREGROUND_DEBOUNCE_MS) {
        return { status: 'current' as const }
      }
      if (inFlightRef.current) return { status: 'current' as const }

      inFlightRef.current = true
      lastCheckRef.current = now
      try {
        return await applyOtaUpdate({
          silent: opts.silent !== false,
          reload: opts.force && opts.silent === false,
          prompt: opts.force && opts.silent === false
        })
      } finally {
        inFlightRef.current = false
      }
    },
    [enabled]
  )

  useEffect(() => {
    if (!enabled) return

    // One auto-apply attempt per cold start; resume from background only downloads quietly.
    void runOpenCheck({ force: true, autoApply: true })

    const sub = AppState.addEventListener('change', (nextState) => {
      const prev = appStateRef.current
      appStateRef.current = nextState
      if (nextState !== 'active' || prev === 'active') return
      void runOpenCheck({ force: true, autoApply: false })
    })

    const poll = setInterval(() => {
      if (AppState.currentState === 'active') void runOpenCheck()
    }, BACKGROUND_POLL_MS)

    return () => {
      sub.remove()
      clearInterval(poll)
    }
  }, [enabled, runOpenCheck])

  return {
    checkForOTAUpdate: (interactive = true) =>
      check({ silent: !interactive, force: true }),
    downloadOTAUpdate: () => downloadOtaUpdate(),
    applyDownloadedUpdate: async () => {
      const id = Updates.updateId
      if (id) return reloadWithApplyingUi(id)
      await Updates.reloadAsync()
      return { status: 'downloaded' as const, willReload: true }
    },
    otaEnabled: Updates.isEnabled,
    otaChannel: Updates.channel,
    runtimeVersion: Updates.runtimeVersion,
    updateId: Updates.updateId,
    isEmbeddedLaunch: Updates.isEmbeddedLaunch
  }
}
