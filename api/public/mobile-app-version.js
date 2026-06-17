/**
 * Public mobile app version manifest for Android sideload update checks.
 * GET /api/public/mobile-app-version
 */
import { ok, badRequest, serverError } from '../_lib/response.js'

const ANDROID_VERSION = {
  versionCode: 18,
  versionName: '0.4.4',
  apkUrl: 'https://abcoafrica.co.za/api/public/mobile-apk/download',
  releaseNotes:
    'Smaller release APK (phone-only ABIs), OTA runtime erp-mobile-4, and latest native shell fixes. Download and install once — JS updates continue via Check for JS update.',
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
