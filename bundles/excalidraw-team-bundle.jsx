/**
 * Bundled once into dist/excalidraw-team-bundle.js — uses global React / ReactDOM from index.html.
 * Exposed as window.TeamExcalidrawBundle.mountTeamExcalidraw / .unmountTeamExcalidraw
 */
import { Excalidraw } from '@excalidraw/excalidraw'

const React = typeof window !== 'undefined' ? window.React : null
const ReactDOM = typeof window !== 'undefined' ? window.ReactDOM : null

let lastUnmount = null

export function mountTeamExcalidraw(container, options) {
  if (!React || !ReactDOM || !container) return () => {}
  if (lastUnmount) {
    try {
      lastUnmount()
    } catch (_) {}
    lastUnmount = null
  }
  const {
    initialData,
    onChange,
    theme,
    viewModeEnabled,
    excalidrawAPI
  } = options || {}

  const root = ReactDOM.createRoot(container)
  const props = {
    initialData: initialData || undefined,
    onChange: (elements, appState, files) => {
      if (typeof onChange === 'function') onChange({ elements, appState, files })
    },
    viewModeEnabled: !!viewModeEnabled,
    theme: theme === 'dark' ? 'dark' : 'light',
    excalidrawAPI: typeof excalidrawAPI === 'function' ? excalidrawAPI : undefined
  }
  root.render(React.createElement(Excalidraw, props))
  lastUnmount = () => {
    try {
      root.unmount()
    } catch (_) {}
    lastUnmount = null
  }
  return lastUnmount
}

export function unmountTeamExcalidraw() {
  if (lastUnmount) {
    try {
      lastUnmount()
    } catch (_) {}
    lastUnmount = null
  }
}
