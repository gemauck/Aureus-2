/**
 * Public mobile app version manifest for Android sideload update checks.
 * GET /api/public/mobile-app-version
 */
import { ok, badRequest, serverError } from '../_lib/response.js'

const ANDROID_VERSION = {
  versionCode: 8,
  versionName: '0.3.4',
  apkUrl: 'https://abcoafrica.co.za/downloads/Abcotronics-ERP-Mobile.apk',
  releaseNotes: 'Self-hosted OTA on abcoafrica.co.za — no Expo account needed.'
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
