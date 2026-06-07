import type React from 'react'

/** Defer a stack screen module until React Navigation mounts that route. */
export function lazyNavScreen<T extends React.ComponentType<unknown>>(
  loader: () => T
): () => T {
  let cached: T | null = null
  return () => {
    if (!cached) cached = loader()
    return cached
  }
}
