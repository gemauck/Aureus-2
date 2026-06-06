# Abcotronics ERP Mobile (React Native)

**Path B** — native Android/iOS app for field workflows. This replaces the Capacitor WebView wrapper for job cards when you ship this build to technicians.

## Quick start

1. Install dependencies:
   ```bash
   cd mobile-rn
   npm install
   ```
2. Configure API:
   ```bash
   cp .env.example .env
   # EXPO_PUBLIC_API_BASE_URL=https://abcoafrica.co.za  (or local server)
   ```
3. Start Metro:
   ```bash
   npm run start
   ```
4. Run on Android (device or emulator):
   ```bash
   npm run android
   ```

From repo root: `npm run mobile:android` (same as above).

## Authentication

Uses existing mobile auth endpoints:

- `POST /api/auth/mobile/login`
- `POST /api/auth/mobile/refresh`
- `POST /api/auth/mobile/logout`

Sign in with your ERP user email and password (active users only).

## Job cards (native module)

After login, open **Job cards (native)** from Home.

| Feature | Status |
|--------|--------|
| List job cards from API | ✅ |
| View job card detail | ✅ |
| Create job card (authenticated API) | ✅ |
| Client + site picker | ✅ |
| **Start trip** / **Arrived on site** (GPS while app open) | ✅ |
| Offline queue + sync | ✅ |
| Photos / stock / voice (web parity) | 🔜 Phase 2+ |

### Trip tracking

- Tap **Start trip** when leaving the office → sets `timeOfDeparture` and records GPS points.
- Tap **Arrived on site** → sets `timeOfArrival` and computes route distance (stored via odometer fields for API compatibility).
- Requires location permission; works best with the app in the **foreground** (background tracking is a later phase).

### Offline

If the device is offline (or the server fails), saves are queued in AsyncStorage and synced automatically when you are back online — including in the background while you use other modules, when the app returns to the foreground, or when you tap **Sync now** on the Job cards home screen.

## Pilot modules (existing shells)

- Dashboard, Clients, Projects, Tasks, Notifications, Attachments — list/load stubs from Phase 1 pilot.

## Installable APK (no dev server)

Debug builds expect Metro on your PC (`localhost:8081`) and will red-screen on a phone. Build a **standalone** APK:

```bash
npm run mobile:apk
```

Output: `~/Desktop/Abcotronics-ERP-Mobile.apk` (release build with embedded JS bundle).

## OTA updates (JS bundle — self-hosted on abcoafrica.co.za)

No Expo account required. The server hosts JS bundles; the app checks on launch via `expo-updates`.

### Publish a JS update

After changing code under `mobile-rn/src/` (no native module changes):

```bash
npm run mobile:ota:publish
```

This exports the bundle to `public/mobile-ota/updates/erp-mobile-1/{timestamp}/`. **Deploy the server** (git pull + restart) so devices receive it.

### When you need a new APK

- New native modules or permissions (camera, etc.)
- Expo SDK upgrade
- Bump **`erp-mobile-1`** → **`erp-mobile-2`** in `app.config.js` and `src/constants/ota.ts`, then `npm run mobile:apk`

### Two update layers

| Layer | Command | User action |
|-------|---------|-------------|
| **OTA (JS)** | `npm run mobile:ota:publish` + deploy server | None — auto on launch |
| **APK (native)** | `npm run mobile:apk` + upload to `/downloads/` | Install when prompted |

Settings → **Check for JS update (OTA)** or **Check for new APK**.

## vs Capacitor APK (`android/`)

| | Capacitor `Job Card` APK | This React Native app |
|--|--------------------------|------------------------|
| UI | Remote website in WebView | Native screens |
| Login | Public form (no login) | ERP user login |
| Package | `com.abcotronics.jobcard` | `com.abcotronics.erp.mobile` |
| GPS trip | Web geolocation only | `expo-location` native |

Use **this app** for authenticated technicians; retire or keep the Capacitor build only as a legacy public-form shortcut if needed.

## Docs

- Parity plan: `docs/android-parity/`
- API gaps: `docs/android-parity/api-mobile-gap-list.md`
