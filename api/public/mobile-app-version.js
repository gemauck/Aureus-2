/**
 * Public mobile app version manifest for Android sideload update checks.
 * GET /api/public/mobile-app-version
 */
import { ok, badRequest, serverError } from '../_lib/response.js'

const ANDROID_VERSION = {
  versionCode: 16,
  versionName: '0.4.1',
  apkUrl: 'https://abcoafrica.co.za/public/downloads/Abcotronics-ERP-Mobile.apk',
  releaseNotes:
    'Notification sounds, chat separated from bell notifications, app icon badge fix, and improved push alerts. Install this APK for the latest native shell.',
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
