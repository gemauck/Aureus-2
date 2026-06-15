import { useCallback, useEffect, useRef } from 'react'
import { Alert, AppState, Platform } from 'react-native'
import * as Updates from 'expo-updates'

const FOREGROUND_DEBOUNCE_MS = 45_000
const BACKGROUND_POLL_MS = 5 * 60_000
/** Wait until login/dashboard can render before background OTA work. */
const LAUNCH_PREFETCH_DELAY_MS = 4_000

export type OtaCheckResult =
  | { status: 'dev' | 'disabled' | 'unsupported' | 'current' }
  | { status: 'downloaded'; willReload: boolean }
  | { status: 'error'; message: string }

let lastPromptedUpdateId: string | null = null
/** Downloaded bundle waiting for explicit user restart (never auto-reload on background). */
let pendingOtaUpdateId: string | null = null

function promptApplyUpdate(updateId?: string | null): Promise<OtaCheckResult> {
  if (updateId && lastPromptedUpdateId === updateId) {
    return Promise.resolve({ status: 'downloaded', willReload: false })
  }
  if (updateId) lastPromptedUpdateId = updateId

  return new Promise((resolve) => {
    Alert.alert(
      'Update ready',
      'A new version was downloaded. Restart now to apply it? Your current screen is saved as a draft where supported.',
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

/** Mark bundle ready and prompt when foreground — never reload while backgrounded. */
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
  if (lastPromptedUpdateId === pendingOtaUpdateId) return
  void promptApplyUpdate(pendingOtaUpdateId)
}

/** Download a newer bundle in the background — user chooses when to restart. */
export async function prefetchOtaUpdate(): Promise<OtaCheckResult> {
  if (__DEV__) return { status: 'dev' }
  if (Platform.OS !== 'android') return { status: 'unsupported' }
  if (!Updates.isEnabled) return { status: 'disabled' }

  try {
    const check = await Updates.checkForUpdateAsync()
    if (!check.isAvailable) return { status: 'current' }

    const fetch = await Updates.fetchUpdateAsync()
    return markDownloadedOtaUpdate(fetch.manifest?.id ?? null)
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'OTA prefetch failed'
    const message =
      /404|unsupported runtime|no ota bundles|no update/i.test(raw)
        ? `No JS bundle on the server for runtime ${Updates.runtimeVersion || 'unknown'}. Deploy and run npm run mobile:ota:publish on the server.`
        : raw
    return {
      status: 'error',
      message
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

    const shouldReload = options.reload === true
    if (!shouldReload) {
      if (options.prompt || options.silent === false) {
        return promptApplyUpdate(updateId)
      }
      return markDownloadedOtaUpdate(updateId)
    }

    pendingOtaUpdateId = null
    await Updates.reloadAsync()
    return { status: 'downloaded', willReload: true }
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'OTA check failed'
    const message =
      /404|unsupported runtime|no ota bundles|no update/i.test(raw)
        ? `No JS bundle on the server for runtime ${Updates.runtimeVersion || 'unknown'}. Deploy and run npm run mobile:ota:publish on the server.`
        : raw
    return {
      status: 'error',
      message
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
      return await prefetchOtaUpdate()
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

    const onAppStateChange = (state: string) => {
      if (state === 'active') {
        tryPromptPendingOtaOnForeground()
        void prefetch()
      }
    }
    const sub = AppState.addEventListener('change', onAppStateChange)

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
