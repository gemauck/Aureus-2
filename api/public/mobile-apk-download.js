/**
 * Android APK sideload — GET /api/public/mobile-apk/download
 * Forces attachment headers so browsers and WebViews download instead of opening the ERP SPA.
 */
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { badRequest } from '../_lib/response.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const MOBILE_APK_FILENAME = 'Abcotronics-ERP-Mobile.apk'
export const MOBILE_APK_RELATIVE_PATH = join('public', 'downloads', MOBILE_APK_FILENAME)

function resolveApkPath() {
  return join(__dirname, '..', '..', MOBILE_APK_RELATIVE_PATH)
}

async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return badRequest(res, 'Method not allowed')
  }

  const apkPath = resolveApkPath()
  if (!existsSync(apkPath)) {
    return res.status(404).type('text/plain').send('Android APK not published yet.')
  }

  res.setHeader('Content-Type', 'application/vnd.android.package-archive')
  res.setHeader('Content-Disposition', `attachment; filename="${MOBILE_APK_FILENAME}"`)
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.setHeader('X-Content-Type-Options', 'nosniff')

  if (req.method === 'HEAD') {
    return res.end()
  }

  return res.sendFile(apkPath)
}

export default handler
