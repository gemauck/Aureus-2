export type OtaUiPhase = 'idle' | 'checking' | 'downloading' | 'applying'

const PHASE_MESSAGE: Record<Exclude<OtaUiPhase, 'idle'>, string> = {
  checking: 'Checking for updates…',
  downloading: 'Downloading update…',
  applying: 'Applying update — restarting app…'
}

let phase: OtaUiPhase = 'idle'
const listeners = new Set<(next: OtaUiPhase) => void>()

export function getOtaUiPhase(): OtaUiPhase {
  return phase
}

export function getOtaUiMessage(nextPhase: OtaUiPhase): string | null {
  if (nextPhase === 'idle') return null
  return PHASE_MESSAGE[nextPhase]
}

export function setOtaUiPhase(next: OtaUiPhase) {
  if (phase === next) return
  phase = next
  listeners.forEach((listener) => listener(next))
}

export function subscribeOtaUiPhase(listener: (next: OtaUiPhase) => void): () => void {
  listeners.add(listener)
  listener(phase)
  return () => listeners.delete(listener)
}
