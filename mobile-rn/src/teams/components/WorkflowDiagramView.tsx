import React, { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'
import type { TeamWorkflow } from '../types'
import { parseJsonField } from '../utils'

type DrawioCanvas = { drawioXml?: string }
type ExcalidrawCanvas = { elements?: unknown[]; appState?: Record<string, unknown> }

function buildDrawioHtml(xml: string) {
  const payload = JSON.stringify({
    highlight: '#2563eb',
    nav: true,
    resize: true,
    toolbar: 'zoom layers',
    xml
  })
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=4,user-scalable=yes"/>
<style>html,body{margin:0;padding:0;height:100%;background:#fff;overflow:hidden;}</style>
</head><body>
<div class="mxgraph" style="max-width:100%;border:0;min-height:100vh;" data-mxgraph='${payload.replace(/'/g, '&#39;')}'></div>
<script src="https://viewer.diagrams.net/js/viewer-static.min.js"></script>
</body></html>`
}

function buildExcalidrawHtml(canvas: ExcalidrawCanvas) {
  const elements = canvas.elements || []
  const appState = canvas.appState || {}
  const json = JSON.stringify({ elements, appState: { ...appState, viewBackgroundColor: '#ffffff' } })
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=4,user-scalable=yes"/>
<style>html,body{margin:0;padding:0;height:100%;background:#fff;}#wrap{height:100vh;}</style>
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@excalidraw/excalidraw@0.17.6/dist/excalidraw.production.min.js"></script>
</head><body><div id="wrap"></div>
<script>
const data = ${json};
const root = ReactDOM.createRoot(document.getElementById('wrap'));
root.render(React.createElement(ExcalidrawLib.Excalidraw, {
  initialData: data,
  viewModeEnabled: true,
  zenModeEnabled: true,
  gridModeEnabled: false,
  UIOptions: { canvasActions: { loadScene: false, export: false, saveAsImage: false } }
}));
</script></body></html>`
}

export function WorkflowDiagramView({ workflow }: { workflow: TeamWorkflow }) {
  const html = useMemo(() => {
    const raw = workflow.canvasData
    const canvas = parseJsonField<DrawioCanvas & ExcalidrawCanvas>(
      typeof raw === 'string' ? raw : raw,
      {}
    )
    if (workflow.canvasKind === 'drawio' && canvas.drawioXml) {
      return buildDrawioHtml(canvas.drawioXml)
    }
    if (workflow.canvasKind === 'excalidraw' && canvas.elements?.length) {
      return buildExcalidrawHtml(canvas)
    }
    if (typeof raw === 'string' && raw.trim().startsWith('<mxfile')) {
      return buildDrawioHtml(raw)
    }
    return null
  }, [workflow])

  if (!html) return null

  return (
    <View style={styles.wrap}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={styles.webview}
        scrollEnabled
        setSupportMultipleWindows={false}
        javaScriptEnabled
        domStorageEnabled
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 420, borderRadius: 8, overflow: 'hidden' },
  webview: { flex: 1, backgroundColor: '#fff' }
})
