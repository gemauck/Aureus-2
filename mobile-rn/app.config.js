const fs = require('fs')
const path = require('path')

/** Bump when native modules / permissions change — must match native APK expo_runtime_version. */
const RUNTIME_VERSION = 'erp-mobile-3'

const OTA_BASE =
  process.env.MOBILE_OTA_PUBLIC_URL ||
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  'https://abcoafrica.co.za'

const base = require('./app.json').expo

const plugins = [...(base.plugins || [])]
if (!plugins.some((p) => p === 'expo-updates' || (Array.isArray(p) && p[0] === 'expo-updates'))) {
  plugins.push('expo-updates')
}

module.exports = {
  expo: {
    ...base,
    runtimeVersion: RUNTIME_VERSION,
    plugins,
    updates: {
      enabled: true,
      url: `${OTA_BASE.replace(/\/$/, '')}/api/public/mobile-ota/manifest`,
      // Safeguards: native never checks/applies on cold start — JS hook prefetches after login (no auto-reload).
      checkAutomatically: 'NEVER',
      fallbackToCacheTimeout: 0
    },
    extra: {
      ...(base.extra || {}),
      runtimeVersion: RUNTIME_VERSION,
      otaChannel: 'production',
      otaServer: 'self-hosted',
      apiBaseUrl: OTA_BASE.replace(/\/$/, ''),
      sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN || '',
      eas: {
        projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID || process.env.EAS_PROJECT_ID || ''
      }
    }
  }
}
