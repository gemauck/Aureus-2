import { useCallback, useEffect, useRef } from 'react'
import { Alert, AppState, Platform } from 'react-native'
import * as Updates from 'expo-updates'

const FOREGROUND_DEBOUNCE_MS = 45_000
const BACKGROUND_POLL_MS = 5 * 60_000
const PROMPT_DELAY_MS = 1_500

export type OtaCheckResult =
  | { status: 'dev' | 'disabled' | 'unsupported' | 'current' }
  | { status: 'downloaded'; willReload: boolean }
  | { status: 'error'; message: string }

let lastPromptedUpdateId: string | null = null
let pendingPromptTimer: ReturnType<typeof setTimeout> | null = null

function clearPendingPromptTimer() {
  if (pendingPromptTimer) {
    clearTimeout(pendingPromptTimer)
    pendingPromptTimer = null
  }
}

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

function scheduleApplyPrompt(updateId?: string | null): Promise<OtaCheckResult> {
  clearPendingPromptTimer()
  return new Promise((resolve) => {
    pendingPromptTimer = setTimeout(() => {
      pendingPromptTimer = null
      void promptApplyUpdate(updateId).then(resolve)
    }, PROMPT_DELAY_MS)
  })
}

export async function applyOtaUpdate(
  options: { silent?: boolean; reload?: boolean } = {}
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
      return scheduleApplyPrompt(updateId)
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

/** Silent OTA checks on launch, foreground, and periodic poll while the app is open. */
export function useOTAUpdates(enabled = true) {
  const inFlightRef = useRef(false)
  const lastCheckRef = useRef(0)

  const check = useCallback(async (opts: { silent?: boolean; force?: boolean } = {}) => {
    if (!enabled && !opts.force) return applyOtaUpdate(opts)

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
        reload: opts.force && opts.silent === false
      })
    } finally {
      inFlightRef.current = false
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return

    void check({ silent: true, force: true })

    const onActive = (state: string) => {
      if (state === 'active') void check({ silent: true })
    }
    const sub = AppState.addEventListener('change', onActive)

    const poll = setInterval(() => {
      if (AppState.currentState === 'active') void check({ silent: true })
    }, BACKGROUND_POLL_MS)

    return () => {
      sub.remove()
      clearInterval(poll)
    }
  }, [enabled, check])

  return {
    checkForOTAUpdate: (interactive = true) =>
      check({ silent: !interactive, force: true }),
    otaEnabled: Updates.isEnabled,
    otaChannel: Updates.channel,
    runtimeVersion: Updates.runtimeVersion,
    updateId: Updates.updateId,
    isEmbeddedLaunch: Updates.isEmbeddedLaunch
  }
}
