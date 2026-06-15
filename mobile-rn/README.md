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

Mobile auth endpoints:

- `POST /api/auth/mobile/login` — returns access + refresh tokens and `user.permissions`
- `POST /api/auth/mobile/refresh`
- `POST /api/auth/mobile/logout`
- `POST /api/auth/mobile/embed-token` — short-lived (15 min) token for in-app WebView modules

Sign in with your ERP user email and password (active users only). Menu visibility follows the same permission rules as the web ERP.

WebView modules (Manufacturing tabs, Reports) receive an **embed token** instead of the long-lived access token. Helpdesk and Documents still open in the system browser until their in-app WebView shells land.

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
| Photos (capture + thumbnails while offline) | ✅ |
| Stock from van / warehouse (offline picker) | ✅ |
| Voice notes (record offline, transcribe on reconnect) | ✅ |

### Trip tracking

- Tap **Start trip** when leaving the office → sets `timeOfDeparture` and records GPS points.
- Tap **Arrived on site** → sets `timeOfArrival` and computes route distance (stored via odometer fields for API compatibility).
- Requires location permission; works best with the app in the **foreground** (background tracking is a later phase).

### Offline

If the device is offline (or the server fails), saves are queued in AsyncStorage and synced automatically when you are back online — including in the background while you use other modules, when the app returns to the foreground, or when you tap **Sync now** on the Job cards home screen.

**Photos:** Captured images are stored locally with thumbnails visible in the gallery and on unsynced cards in the prior list. Full-resolution data is embedded in the queued payload and uploads with the card.

**Stock:** Select a van or warehouse location, then pick SKUs from on-hand stock at that site. Per-location stock lists are cached on device after the first online load (or when you open the Stock step while online). Manufacturing ledger movements are created server-side after sync.

**Voice:** Record clips offline; transcription runs automatically when connectivity returns (OpenAI Whisper via `/api/public/transcribe-audio`). Transcripts are appended to the relevant text field and saved with the draft.

### Incident reports

Open **Service & Maintenance** from the menu, or **Job cards** → **Report incident** / **Incident reports**.

| Feature | Status |
|--------|--------|
| Create incident (client, site, type, severity, date, status) | ✅ |
| Link to active job card (from Visit step) | ✅ |
| List your incidents | ✅ |
| Edit saved incident | ✅ |
| Share PDF (server-generated) | ✅ |
| Report from CRM client (Service & Maintenance tab) | ✅ |

Incident reports can be **created and edited offline** (queued on device, synced on reconnect). PDF download still requires connectivity. Stock-take counts can be entered offline; drafts auto-save locally and submissions queue until online.

**Phase 1 offline (Service & Maintenance):**

- Open **synced job cards** from device cache after one online visit (last 50 opened cards).
- **Prior list** shows cached server cards when offline (merged with local pending).
- **Client sites** cached per client after first online load.
- **Pending uploads** screen lists job cards, incidents, and stock-takes waiting to sync, with per-item Retry and Sync all.

**Phase 2 offline (read-mostly navigation):**

- **My Tasks** — last fetched task list cached on device; browse offline after one online load.
- **Projects** — project list and all-tasks tab cached (starred filter still works via local starred IDs).
- **Clients** — clients/leads/groups lists cached; **Recent** filter shows last opened records; **Starred** works from cached data.
- **Notifications** — last fetched list and unread badge count cached for offline viewing.

**Phase 2.5 offline (detail read + sync safety):**

- **Detail screens** — open cached task, project, CRM record, or dashboard snapshot after one online visit (read-only offline).
- **Job card sync conflicts** — if the server copy changed after you opened a card, sync pauses with a choice: keep your changes or use the server copy.

## Pilot modules (existing shells)

- Dashboard, Clients, Projects, Tasks, Notifications, Attachments — list/load stubs from Phase 1 pilot.

## Installable APK (no dev server)

Debug builds expect Metro on your PC (`localhost:8081`) and will red-screen on a phone. Build a **standalone** APK:

```bash
npm run mobile:apk
```

Output: `~/Desktop/Abcotronics-ERP-Mobile.apk` (release build with embedded JS bundle).

### Release signing (production)

1. Copy `android/keystore.properties.example` → `android/keystore.properties` (gitignored).
2. Point `ERP_RELEASE_STORE_FILE` at your release keystore and set passwords/alias.
3. Rebuild with `npm run mobile:apk`.

Without `keystore.properties`, release builds fall back to the debug keystore (not suitable for production rollout).

### Optional: Sentry

Set `EXPO_PUBLIC_SENTRY_DSN` in `.env` (see `.env.example`), then rebuild the native APK so `@sentry/react-native` is linked.

Install to a connected phone or emulator (no manual download):

```bash
npm run mobile:adb:install          # install existing Desktop APK via adb
npm run mobile:apk:install          # build release APK, then adb install
```

## OTA updates (JS bundle — self-hosted on abcoafrica.co.za)

No Expo account required. The server hosts JS bundles; the app checks on launch via `expo-updates`.

### Publish a JS update

After changing code under `mobile-rn/src/` (no native module changes):

```bash
npm run mobile:ota:publish
```

This exports the bundle to `public/mobile-ota/updates/erp-mobile-2/{timestamp}/`. **Deploy the server** (git pull + restart) so devices receive it.

### When you need a new APK

- New native modules or permissions (camera, Sentry, etc.)
- Expo SDK upgrade
- Bump runtime version in `app.config.js` and `src/constants/ota.ts`, then `npm run mobile:apk`

### Two update layers

| Layer | Command | User action |
|-------|---------|-------------|
| **OTA (JS)** | `npm run mobile:ota:publish` + deploy server | Tap **Restart** when prompted (or cold-start the app) |
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
