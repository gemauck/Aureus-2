import { useCallback, useEffect, useRef } from 'react'
import { Alert, AppState, Platform } from 'react-native'
import * as Updates from 'expo-updates'
import { isApkUpdateRequired, waitForApkVersionCheck } from '../services/apkUpdateUi'
import { setOtaUiPhase } from '../services/otaUpdateUi'
import { trackError } from '../services/telemetry'

const FOREGROUND_DEBOUNCE_MS = 30_000
const BACKGROUND_POLL_MS = 5 * 60_000
const PROMPT_COOLDOWN_MS = 3 * 60_000
const APPLY_BRIEF_MS = 700

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

async function reloadWithApplyingUi(): Promise<OtaCheckResult> {
  setOtaUiPhase('applying')
  pendingOtaUpdateId = null
  await new Promise((resolve) => setTimeout(resolve, APPLY_BRIEF_MS))
  await Updates.reloadAsync()
  return { status: 'downloaded', willReload: true }
}

function updateReady(
  check: Updates.UpdateCheckResult,
  fetchResult: Updates.UpdateFetchResult | null,
  runningId: string | null | undefined
): boolean {
  const downloadedId = fetchResult?.manifest?.id ?? null
  if (downloadedId && runningId && downloadedId !== runningId) return true
  return Boolean(check.isAvailable && fetchResult?.manifest?.id)
}

/**
 * Sync OTA state with the server.
 * After fetchUpdateAsync the client may report "no update" while a downloaded bundle
 * is still unapplied — compare running updateId vs downloaded manifest id.
 */
export async function syncOtaUpdate(
  options: { mode?: OtaSyncMode } = {}
): Promise<OtaCheckResult> {
  const blocked = otaDisabled()
  if (blocked) return blocked

  const mode = options.mode || 'background'

  try {
    let fetchResult: Updates.UpdateFetchResult | null = null

    const check = await Updates.checkForUpdateAsync()
    if (check.isAvailable) {
      if (mode === 'auto') setOtaUiPhase('downloading')
      fetchResult = await Updates.fetchUpdateAsync()
    } else {
      // Staged download may exist while the running bundle is still old.
      try {
        fetchResult = await Updates.fetchUpdateAsync()
        if (mode === 'auto' && fetchResult?.manifest?.id) {
          setOtaUiPhase('downloading')
        }
      } catch {
        fetchResult = null
      }
    }

    const runningId = Updates.updateId
    const ready = updateReady(check, fetchResult, runningId)

    if (!ready) {
      if (mode === 'auto') setOtaUiPhase('idle')
      return { status: 'current' }
    }

    const updateId = fetchResult?.manifest?.id ?? null

    if (mode === 'auto') {
      return reloadWithApplyingUi()
    }

    if (mode === 'prompt') {
      return promptApplyUpdate(updateId)
    }

    return markDownloadedOtaUpdate(updateId)
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

/** Push nudge from admin Users page — auto-download and apply with on-screen status. */
export async function handleRemoteOtaNudge(): Promise<OtaCheckResult> {
  return syncOtaUpdate({ mode: 'auto' })
}

export async function applyOtaUpdate(
  options: { silent?: boolean; reload?: boolean; prompt?: boolean } = {}
): Promise<OtaCheckResult> {
  const blocked = otaDisabled()
  if (blocked) return blocked

  if (options.reload === true) {
    try {
      const result = await syncOtaUpdate({ mode: options.prompt ? 'prompt' : 'auto' })
      if (result.status === 'downloaded' && result.willReload) return result
      pendingOtaUpdateId = null
      return reloadWithApplyingUi()
    } catch (error) {
      setOtaUiPhase('idle')
      return formatOtaError(error, 'OTA apply')
    }
  }

  return syncOtaUpdate({
    mode: options.prompt ? 'prompt' : options.silent === false ? 'prompt' : 'background'
  })
}

/** OTA sync on every app open (cold start + return from background), plus periodic poll. */
export function useOTAUpdates(enabled = true) {
  const inFlightRef = useRef(false)
  const lastCheckRef = useRef(0)
  const appStateRef = useRef(AppState.currentState)

  const runOpenCheck = useCallback(
    async (opts: { force?: boolean } = {}) => {
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
        return await syncOtaUpdate({ mode: 'auto' })
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

    void runOpenCheck({ force: true })

    const sub = AppState.addEventListener('change', (nextState) => {
      const prev = appStateRef.current
      appStateRef.current = nextState
      if (nextState !== 'active' || prev === 'active') return

      resetOtaPromptCooldown()
      void runOpenCheck({ force: true })
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
    applyDownloadedUpdate: () => reloadWithApplyingUi(),
    otaEnabled: Updates.isEnabled,
    otaChannel: Updates.channel,
    runtimeVersion: Updates.runtimeVersion,
    updateId: Updates.updateId,
    isEmbeddedLaunch: Updates.isEmbeddedLaunch
  }
}
