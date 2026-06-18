import { useCallback, useEffect, useRef } from 'react'
import { Alert, AppState, Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Updates from 'expo-updates'
import { isJobCardWizardFormActive } from '../jobcards/jobCardWizardLock'
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

function manifestId(manifest: Updates.Manifest | null | undefined): string | null {
  const id = manifest && 'id' in manifest ? manifest.id : undefined
  return typeof id === 'string' && id.length > 0 ? id : null
}

/** Resolve a staged update id from check/fetch results (fetch omits manifest when already downloaded). */
function resolveApplyReadyUpdateId(
  check: Awaited<ReturnType<typeof Updates.checkForUpdateAsync>>,
  fetchResult: Awaited<ReturnType<typeof Updates.fetchUpdateAsync>>
): { updateId: string | null; freshlyDownloaded: boolean } {
  const runningId = Updates.updateId ?? null
  const updateId =
    manifestId(fetchResult.manifest) ??
    (check.isAvailable ? manifestId(check.manifest) : null) ??
    pendingOtaUpdateId

  if (!updateId || updateId === runningId) {
    if (updateId === runningId) {
      void clearReloadGuard()
      pendingOtaUpdateId = null
    }
    return { updateId: null, freshlyDownloaded: false }
  }

  return { updateId, freshlyDownloaded: fetchResult.isNew === true }
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
            const id = updateId || pendingOtaUpdateId
            if (id) {
              void reloadWithApplyingUi(id).then(resolve)
              return
            }
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
 * Auto-reload only when fetch.isNew in this call — staged bundles from a prior fetch
 * still prompt (never silent auto-reload; that caused restart loops back to Dashboard).
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

    const { updateId: applyId, freshlyDownloaded } = resolveApplyReadyUpdateId(
      check,
      fetchResult
    )
    if (!applyId) {
      if (mode === 'auto') setOtaUiPhase('idle')
      return { status: 'current' }
    }

    // Already on disk from an earlier fetch — prompt only, never auto-reload.
    if (!freshlyDownloaded) {
      if (mode === 'auto') setOtaUiPhase('idle')
      if (mode === 'prompt' || mode === 'auto') {
        return promptApplyUpdate(applyId)
      }
      return markDownloadedOtaUpdate(applyId)
    }

    if (mode === 'auto') {
      if (await shouldSkipAutoReload(applyId, Updates.updateId)) {
        setOtaUiPhase('idle')
        return promptApplyUpdate(applyId)
      }
      return reloadWithApplyingUi(applyId)
    }

    if (mode === 'prompt') {
      return promptApplyUpdate(applyId)
    }

    return markDownloadedOtaUpdate(applyId)
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
        const pending = pendingOtaUpdateId
        if (pending && pending !== Updates.updateId) {
          if (options.prompt) return promptApplyUpdate(pending)
          return reloadWithApplyingUi(pending)
        }
        return { status: 'current' }
      }
      const fetchResult = await Updates.fetchUpdateAsync()
      const { updateId: applyId } = resolveApplyReadyUpdateId(check, fetchResult)
      if (!applyId) return { status: 'current' }
      if (options.prompt) return promptApplyUpdate(applyId)
      return reloadWithApplyingUi(applyId)
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
        if (isJobCardWizardFormActive()) {
          return { status: 'current' as const }
        }
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

    // Download updates in the background only — never auto-reload on cold start (caused broken app loops).
    void runOpenCheck({ force: true, autoApply: false })

    const sub = AppState.addEventListener('change', (nextState) => {
      const prev = appStateRef.current
      appStateRef.current = nextState
      if (nextState !== 'active' || prev === 'active') return
      resetOtaPromptCooldown()
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
      const blocked = otaDisabled()
      if (blocked) return blocked

      try {
        const runningId = Updates.updateId
        if (pendingOtaUpdateId && pendingOtaUpdateId !== runningId) {
          return reloadWithApplyingUi(pendingOtaUpdateId)
        }

        const check = await Updates.checkForUpdateAsync()
        if (check.isAvailable) {
          const fetchResult = await Updates.fetchUpdateAsync()
          const { updateId: applyId } = resolveApplyReadyUpdateId(check, fetchResult)
          if (applyId) return reloadWithApplyingUi(applyId)
        }

        setOtaUiPhase('applying')
        pendingOtaUpdateId = null
        await new Promise((resolve) => setTimeout(resolve, APPLY_BRIEF_MS))
        await Updates.reloadAsync()
        return { status: 'downloaded' as const, willReload: true }
      } catch (error) {
        setOtaUiPhase('idle')
        return formatOtaError(error, 'OTA apply downloaded')
      }
    },
    otaEnabled: Updates.isEnabled,
    otaChannel: Updates.channel,
    runtimeVersion: Updates.runtimeVersion,
    updateId: Updates.updateId,
    isEmbeddedLaunch: Updates.isEmbeddedLaunch
  }
}
