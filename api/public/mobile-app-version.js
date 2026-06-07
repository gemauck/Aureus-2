/**
 * Public mobile app version manifest for Android sideload update checks.
 * GET /api/public/mobile-app-version
 */
import { ok, badRequest, serverError } from '../_lib/response.js'

const ANDROID_VERSION = {
  versionCode: 14,
  versionName: '0.3.9',
  apkUrl: 'https://abcoafrica.co.za/public/downloads/Abcotronics-ERP-Mobile.apk',
  releaseNotes:
    'Mobile Users module (admin user management, invites, permissions), improved notification deep links and unread badges. Install this APK or apply the JS update from Settings.',
  /** Set true only when native shell must be replaced (permissions, SDK, runtime bump). */
  forceApkInstall: false
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
