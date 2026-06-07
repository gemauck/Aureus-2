import { useCallback, useEffect, useRef } from 'react'
import { Alert, AppState, Platform } from 'react-native'
import * as Updates from 'expo-updates'

const FOREGROUND_DEBOUNCE_MS = 45_000
const BACKGROUND_POLL_MS = 5 * 60_000
/** Wait until login/dashboard can render before background OTA work. */
const LAUNCH_PREFETCH_DELAY_MS = 12_000

export type OtaCheckResult =
  | { status: 'dev' | 'disabled' | 'unsupported' | 'current' }
  | { status: 'downloaded'; willReload: boolean }
  | { status: 'error'; message: string }

let lastPromptedUpdateId: string | null = null

function promptApplyUpdate(updateId?: string | null): Promise<OtaCheckResult> {
  if (updateId && lastPromptedUpdateId === updateId) {
    return Promise.resolve({ status: 'downloaded', willReload: false })
  }
  if (updateId) lastPromptedUpdateId = updateId

  return new Promise((resolve) => {
    Alert.alert(
      'Update ready',
      'A new version was downloaded. Tap Restart to apply it — no need to clear cache or force-stop the app.',
      [
        {
          text: 'Later',
          style: 'cancel',
          onPress: () => resolve({ status: 'downloaded', willReload: false })
        },
        {
          text: 'Restart',
          onPress: () => {
            void Updates.reloadAsync()
            resolve({ status: 'downloaded', willReload: true })
          }
        }
      ]
    )
  })
}

/** Download a newer bundle in the background — never reloads or prompts. */
export async function prefetchOtaUpdate(): Promise<OtaCheckResult> {
  if (__DEV__) return { status: 'dev' }
  if (Platform.OS !== 'android') return { status: 'unsupported' }
  if (!Updates.isEnabled) return { status: 'disabled' }

  try {
    const check = await Updates.checkForUpdateAsync()
    if (!check.isAvailable) return { status: 'current' }

    await Updates.fetchUpdateAsync()
    return { status: 'downloaded', willReload: false }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'OTA prefetch failed'
    }
  }
}

/** Fetch a newer JS bundle without reloading — for manual download from Settings. */
export async function downloadOtaUpdate(): Promise<OtaCheckResult> {
  return prefetchOtaUpdate()
}

export async function applyOtaUpdate(
  options: { silent?: boolean; reload?: boolean; prompt?: boolean } = {}
): Promise<OtaCheckResult> {
  if (__DEV__) return { status: 'dev' }
  if (Platform.OS !== 'android') return { status: 'unsupported' }
  if (!Updates.isEnabled) return { status: 'disabled' }

  try {
    const check = await Updates.checkForUpdateAsync()
    if (!check.isAvailable) return { status: 'current' }

    const fetch = await Updates.fetchUpdateAsync()
    const updateId = fetch.manifest?.id ?? null

    const shouldReload = options.reload ?? !options.silent
    if (!shouldReload) {
      if (options.prompt) {
        return promptApplyUpdate(updateId)
      }
      return { status: 'downloaded', willReload: false }
    }

    if (options.silent) {
      await Updates.reloadAsync()
      return { status: 'downloaded', willReload: true }
    }

    return promptApplyUpdate(updateId)
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'OTA check failed'
    }
  }
}

/** Background OTA prefetch on launch (deferred), foreground, and periodic poll. */
export function useOTAUpdates(enabled = true) {
  const inFlightRef = useRef(false)
  const lastCheckRef = useRef(0)

  const prefetch = useCallback(async (opts: { force?: boolean } = {}) => {
    const now = Date.now()
    if (!opts.force && now - lastCheckRef.current < FOREGROUND_DEBOUNCE_MS) {
      return { status: 'current' as const }
    }
    if (inFlightRef.current) return { status: 'current' as const }

    inFlightRef.current = true
    lastCheckRef.current = now
    try {
      const result = await prefetchOtaUpdate()
      if (result.status === 'downloaded') {
        void promptApplyUpdate(null)
      }
      return result
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

    const launchTimer = setTimeout(() => {
      void prefetch({ force: true })
    }, LAUNCH_PREFETCH_DELAY_MS)

    const onActive = (state: string) => {
      if (state === 'active') void prefetch()
    }
    const sub = AppState.addEventListener('change', onActive)

    const poll = setInterval(() => {
      if (AppState.currentState === 'active') void prefetch()
    }, BACKGROUND_POLL_MS)

    return () => {
      clearTimeout(launchTimer)
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
