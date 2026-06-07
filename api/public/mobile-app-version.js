/**
 * Public mobile app version manifest for Android sideload update checks.
 * GET /api/public/mobile-app-version
 */
import { ok, badRequest, serverError } from '../_lib/response.js'

const ANDROID_VERSION = {
  /** Match JS APP_VERSION_CODE in older OTA bundles until devices refresh (avoids APK re-download loop). */
  versionCode: 10,
  versionName: '0.3.5',
  apkUrl: 'https://abcoafrica.co.za/public/downloads/Abcotronics-ERP-Mobile.apk',
  releaseNotes:
    'OTA updates apply with one tap — tap Restart when prompted (no force-stop or cache clear). JS updates stay automatic.',
  /** Set true only when native modules/permissions change and users must install a new APK once. */
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
