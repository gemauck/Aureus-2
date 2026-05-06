#!/usr/bin/env node
import esbuild from 'esbuild'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const shims = path.join(root, 'bundles', 'shims')

async function main() {
  await esbuild.build({
    entryPoints: [path.join(root, 'bundles', 'excalidraw-team-bundle.jsx')],
    outfile: path.join(root, 'dist', 'excalidraw-team-bundle.js'),
    bundle: true,
    format: 'iife',
    globalName: 'TeamExcalidrawBundle',
    platform: 'browser',
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    define: {
      'process.env.NODE_ENV': '"production"',
      'process.env.IS_PREACT': '"false"'
    },
    alias: {
      react: path.join(shims, 'react-shim.cjs'),
      'react-dom': path.join(shims, 'react-dom-shim.cjs'),
      'react-dom/client': path.join(shims, 'react-dom-client-shim.cjs'),
      'react/jsx-runtime': path.join(shims, 'react-jsx-runtime-shim.cjs')
    }
  })
  console.log('✅ dist/excalidraw-team-bundle.js')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
