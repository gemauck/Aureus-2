/**
 * Public mobile app version manifest for Android sideload update checks.
 * GET /api/public/mobile-app-version
 */
import { ok, badRequest, serverError } from '../_lib/response.js'

const ANDROID_VERSION = {
  versionCode: 13,
  versionName: '0.3.8',
  apkUrl: 'https://abcoafrica.co.za/public/downloads/Abcotronics-ERP-Mobile.apk',
  releaseNotes:
    'Fixes Expense Capture closing the app — native camera/document modules load only when used. Includes document-picker plugin and safer lazy screen loading.',
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
