const fs = require('fs')
const path = require('path')

/** Bump when native modules / permissions change — must match native APK expo_runtime_version. */
const RUNTIME_VERSION = 'erp-mobile-4'

const OTA_BASE =
  process.env.MOBILE_OTA_PUBLIC_URL ||
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  'https://abcoafrica.co.za'

const base = require('./app.json').expo

const plugins = [...(base.plugins || [])]
if (!plugins.some((p) => p === 'expo-updates' || (Array.isArray(p) && p[0] === 'expo-updates'))) {
  plugins.push('expo-updates')
}
if (!plugins.some((p) => Array.isArray(p) && p[0] === 'expo-build-properties')) {
  plugins.push([
    'expo-build-properties',
    {
      android: {
        // Drop x86/x86_64 emulator ABIs from release APKs (~30–50 MB smaller).
        buildArchs: ['armeabi-v7a', 'arm64-v8a']
      }
    }
  ])
}
if (
  !plugins.some(
    (p) => Array.isArray(p) && (p[0] === 'react-native-android-widget' || p[0] === 'react-native-android-widget/app.plugin')
  )
) {
  plugins.push([
    'react-native-android-widget',
    {
      widgets: [
        {
          name: 'ErpTasks',
          label: 'My Tasks',
          description: 'Open tasks from Abcotronics ERP',
          minWidth: '180dp',
          minHeight: '110dp',
          targetCellWidth: 3,
          targetCellHeight: 2,
          previewImage: './assets/icon.png',
          resizeMode: 'horizontal|vertical',
          updatePeriodMillis: 1800000
        },
        {
          name: 'ErpNotifications',
          label: 'Notifications',
          description: 'Unread ERP notifications at a glance',
          minWidth: '110dp',
          minHeight: '110dp',
          targetCellWidth: 2,
          targetCellHeight: 2,
          previewImage: './assets/icon.png',
          updatePeriodMillis: 1800000
        },
        {
          name: 'ErpSummary',
          label: 'ERP Overview',
          description: 'Tasks, notifications, projects and job cards',
          minWidth: '250dp',
          minHeight: '140dp',
          targetCellWidth: 4,
          targetCellHeight: 3,
          previewImage: './assets/icon.png',
          resizeMode: 'horizontal|vertical',
          updatePeriodMillis: 1800000
        }
      ]
    }
  ])
}

module.exports = {
  expo: {
    ...base,
    runtimeVersion: RUNTIME_VERSION,
    plugins,
    updates: {
      enabled: true,
      url: `${OTA_BASE.replace(/\/$/, '')}/api/public/mobile-ota/manifest`,
      // Safeguards: native never checks/applies on cold start — JS hook prefetches after login; user confirms restart.
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
