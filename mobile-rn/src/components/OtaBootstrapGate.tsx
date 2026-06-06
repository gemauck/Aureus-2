import React, { useEffect } from 'react'

import { applyOtaUpdate } from '../hooks/useOTAUpdates'

type Props = { children: React.ReactNode }

/** Prefetch OTA in the background — never block launch or auto-reload (avoids crash loops). */
export function OtaBootstrapGate({ children }: Props) {
  useEffect(() => {
    void applyOtaUpdate({ silent: true, reload: false })
  }, [])

  return <>{children}</>
}
