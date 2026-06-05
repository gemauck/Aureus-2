const fs = require('fs')
const path = require('path')

/** Bump only when native modules / permissions change — not for JS-only OTA publishes. */
const RUNTIME_VERSION = 'erp-mobile-1'

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
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 0
    },
    extra: {
      ...(base.extra || {}),
      runtimeVersion: RUNTIME_VERSION,
      otaChannel: 'production',
      otaServer: 'self-hosted'
    }
  }
}
