import { useCallback, useEffect, useRef } from 'react'
import { Alert, AppState, Platform } from 'react-native'
import * as Updates from 'expo-updates'
import { trackError } from '../services/telemetry'

const FOREGROUND_DEBOUNCE_MS = 30_000
const BACKGROUND_POLL_MS = 5 * 60_000
const PROMPT_COOLDOWN_MS = 3 * 60_000

export type OtaCheckResult =
  | { status: 'dev' | 'disabled' | 'unsupported' | 'current' }
  | { status: 'downloaded'; willReload: boolean }
  | { status: 'error'; message: string }

let lastPromptedUpdateId: string | null = null
let lastPromptedAt = 0
let pendingOtaUpdateId: string | null = null

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

function tryPromptPendingOtaOnForeground() {
  if (!pendingOtaUpdateId) return
  void promptApplyUpdate(pendingOtaUpdateId)
}

/**
 * Sync OTA state with the server.
 * After fetchUpdateAsync the client may report "no update" while a downloaded bundle
 * is still unapplied — compare running updateId vs downloaded manifest id.
 */
export async function syncOtaUpdate(
  options: { coldStart?: boolean; interactive?: boolean } = {}
): Promise<OtaCheckResult> {
  const blocked = otaDisabled()
  if (blocked) return blocked

  const coldStart = options.coldStart === true
  const interactive = options.interactive === true

  try {
    let fetchResult: Updates.UpdateFetchResult | null = null

    const check = await Updates.checkForUpdateAsync()
    if (check.isAvailable) {
      fetchResult = await Updates.fetchUpdateAsync()
    } else {
      // Staged download may exist while the running bundle is still old.
      try {
        fetchResult = await Updates.fetchUpdateAsync()
      } catch {
        fetchResult = null
      }
    }

    const downloadedId = fetchResult?.manifest?.id ?? null
    const runningId = Updates.updateId

    if (downloadedId && runningId && downloadedId !== runningId) {
      if (coldStart) {
        pendingOtaUpdateId = null
        await Updates.reloadAsync()
        return { status: 'downloaded', willReload: true }
      }
      if (interactive) {
        return promptApplyUpdate(downloadedId)
      }
      return markDownloadedOtaUpdate(downloadedId)
    }

    if (check.isAvailable && fetchResult?.manifest?.id) {
      if (coldStart) {
        pendingOtaUpdateId = null
        await Updates.reloadAsync()
        return { status: 'downloaded', willReload: true }
      }
      if (interactive) {
        return promptApplyUpdate(fetchResult.manifest.id)
      }
      return markDownloadedOtaUpdate(fetchResult.manifest.id)
    }

    return { status: 'current' }
  } catch (error) {
    return formatOtaError(error, 'OTA sync')
  }
}

/** Download a newer bundle in the background — user chooses when to restart (unless cold start). */
export async function prefetchOtaUpdate(
  options: { coldStart?: boolean } = {}
): Promise<OtaCheckResult> {
  return syncOtaUpdate({ coldStart: options.coldStart, interactive: false })
}

/** Fetch a newer JS bundle without reloading — for manual download from Settings. */
export async function downloadOtaUpdate(): Promise<OtaCheckResult> {
  return syncOtaUpdate({ interactive: true })
}

/** Push nudge from admin Users page — force interactive OTA check. */
export async function handleRemoteOtaNudge(): Promise<OtaCheckResult> {
  return syncOtaUpdate({ interactive: true })
}

export async function applyOtaUpdate(
  options: { silent?: boolean; reload?: boolean; prompt?: boolean } = {}
): Promise<OtaCheckResult> {
  const blocked = otaDisabled()
  if (blocked) return blocked

  if (options.reload === true) {
    try {
      const result = await syncOtaUpdate({ interactive: options.prompt === true })
      if (result.status === 'downloaded' && result.willReload) return result
      pendingOtaUpdateId = null
      await Updates.reloadAsync()
      return { status: 'downloaded', willReload: true }
    } catch (error) {
      return formatOtaError(error, 'OTA apply')
    }
  }

  return syncOtaUpdate({
    interactive: options.prompt === true || options.silent === false
  })
}

/** OTA sync on app launch (before login), foreground, and periodic poll. */
export function useOTAUpdates(enabled = true) {
  const inFlightRef = useRef(false)
  const lastCheckRef = useRef(0)
  const coldStartDoneRef = useRef(false)

  const prefetch = useCallback(async (opts: { force?: boolean; coldStart?: boolean } = {}) => {
    const now = Date.now()
    if (!opts.force && !opts.coldStart && now - lastCheckRef.current < FOREGROUND_DEBOUNCE_MS) {
      return { status: 'current' as const }
    }
    if (inFlightRef.current) return { status: 'current' as const }

    inFlightRef.current = true
    lastCheckRef.current = now
    try {
      return await prefetchOtaUpdate({ coldStart: opts.coldStart })
    } finally {
      inFlightRef.current = false
    }
  }, [])

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

    if (!coldStartDoneRef.current) {
      coldStartDoneRef.current = true
      void prefetch({ force: true, coldStart: true })
    }

    const onAppStateChange = (state: string) => {
      if (state === 'active') {
        tryPromptPendingOtaOnForeground()
        void prefetch({ force: true })
      }
    }
    const sub = AppState.addEventListener('change', onAppStateChange)

    const poll = setInterval(() => {
      if (AppState.currentState === 'active') void prefetch()
    }, BACKGROUND_POLL_MS)

    return () => {
      sub.remove()
      clearInterval(poll)
    }
  }, [enabled, prefetch])

  return {
    checkForOTAUpdate: (interactive = true) =>
      check({ silent: !interactive, force: true }),
    downloadOTAUpdate: () => downloadOtaUpdate(),
    applyDownloadedUpdate: () => Updates.reloadAsync(),
    otaEnabled: Updates.isEnabled,
    otaChannel: Updates.channel,
    runtimeVersion: Updates.runtimeVersion,
    updateId: Updates.updateId,
    isEmbeddedLaunch: Updates.isEmbeddedLaunch
  }
}
