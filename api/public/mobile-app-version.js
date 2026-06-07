/**
 * Public mobile app version manifest for Android sideload update checks.
 * GET /api/public/mobile-app-version
 */
import { ok, badRequest, serverError } from '../_lib/response.js'

const ANDROID_VERSION = {
  versionCode: 11,
  versionName: '0.3.6',
  apkUrl: 'https://abcoafrica.co.za/public/downloads/Abcotronics-ERP-Mobile.apk',
  releaseNotes:
    'Stability fix: disables OTA auto-load, uses embedded app only. Uninstall the old app first, then install this APK once.',
  /** Required — clears bad OTA cache and ships a verified embedded bundle. */
  forceApkInstall: true
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return badRequest(res, 'Method not allowed')
  }
  try {
    return ok(res, {
      android: ANDROID_VERSION,
      ios: { versionName: ANDROID_VERSION.versionName }
    })
  } catch (error) {
    return serverError(res, 'Failed to read mobile app version', error?.message)
  }
}

export default handler
