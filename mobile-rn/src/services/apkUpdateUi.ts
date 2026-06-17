export type RequiredApkUpdate = {
  versionCode: number
  versionName?: string
  releaseNotes?: string
  apkUrl: string
  installedVersionCode: number
}

export type ApkVersionCheckState = 'unknown' | 'checking' | 'current' | 'required'

let checkState: ApkVersionCheckState = 'unknown'
let requiredUpdate: RequiredApkUpdate | null = null
let checkWaiters: Array<(state: ApkVersionCheckState) => void> = []
const stateListeners = new Set<(state: ApkVersionCheckState, required: RequiredApkUpdate | null) => void>()

function notify() {
  stateListeners.forEach((listener) => listener(checkState, requiredUpdate))
}

export function getApkVersionCheckState(): ApkVersionCheckState {
  return checkState
}

export function isApkUpdateRequired(): boolean {
  return checkState === 'required' && requiredUpdate !== null
}

export function getRequiredApkUpdate(): RequiredApkUpdate | null {
  return requiredUpdate
}

export function setApkVersionChecking() {
  checkState = 'checking'
  notify()
}

export function setApkVersionCurrent() {
  checkState = 'current'
  requiredUpdate = null
  notify()
  checkWaiters.forEach((resolve) => resolve('current'))
  checkWaiters = []
}

export function setRequiredApkUpdate(info: RequiredApkUpdate) {
  checkState = 'required'
  requiredUpdate = info
  notify()
  checkWaiters.forEach((resolve) => resolve('required'))
  checkWaiters = []
}

export function subscribeApkVersionState(
  listener: (state: ApkVersionCheckState, required: RequiredApkUpdate | null) => void
): () => void {
  stateListeners.add(listener)
  listener(checkState, requiredUpdate)
  return () => stateListeners.delete(listener)
}

/** Wait until the first APK version check finishes (for OTA to defer until we know the shell is current). */
export function waitForApkVersionCheck(timeoutMs = 8000): Promise<ApkVersionCheckState> {
  if (checkState === 'current' || checkState === 'required') {
    return Promise.resolve(checkState)
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(checkState), timeoutMs)
    checkWaiters.push((state) => {
      clearTimeout(timer)
      resolve(state)
    })
  })
}
