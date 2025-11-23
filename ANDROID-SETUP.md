# Android App Setup Guide

This guide will help you convert your Abcotronics ERP web application into an Android app using Capacitor.

## Prerequisites

1. **Node.js** (v18 or higher) - Already installed
2. **Java Development Kit (JDK)** - Version 17 or higher
   - Download from: https://adoptium.net/ or https://www.oracle.com/java/technologies/downloads/
   - Verify installation: `java -version`
3. **Android Studio** - Latest version
   - Download from: https://developer.android.com/studio
   - Install Android SDK (API level 33 or higher)
   - Set up Android SDK path in environment variables
4. **Gradle** - Usually comes with Android Studio

## Installation Steps

### 1. Install Capacitor Dependencies

```bash
npm install
```

This will install:
- `@capacitor/core`
- `@capacitor/cli`
- `@capacitor/android`

### 2. Build Your Web Application

First, ensure your web app is built:

```bash
npm run build
```

Or if using the new frontend build:

```bash
npm run build:new
```

This creates the `dist/` directory that Capacitor will use.

### 3. Initialize Android Platform

```bash
npm run android:init
```

This command will:
- Create the `android/` directory
- Set up the Android project structure
- Configure the app with your settings from `capacitor.config.js`

### 4. Sync Web Assets to Android

After making changes to your web app, sync them to Android:

```bash
npm run android:sync
```

This copies your `dist/` files to the Android app's assets.

## Development Workflow

### Option 1: Live Reload (Development)

For development with live reload, you can configure Capacitor to point to your development server:

1. Edit `capacitor.config.js` and uncomment the server section:
```javascript
server: {
  url: 'http://YOUR_LOCAL_IP:5000', // Replace with your local IP
  cleartext: true
}
```

2. Find your local IP address:
   - **Mac/Linux**: `ifconfig | grep "inet "`
   - **Windows**: `ipconfig`

3. Sync and run:
```bash
npm run android:sync
npm run android:open
```

4. In Android Studio, run the app on an emulator or connected device.

**Note**: Make sure your phone/emulator and computer are on the same network.

### Option 2: Production Build (Bundled)

For production, use the bundled files:

1. Ensure `capacitor.config.js` has the server section commented out or removed
2. Build your web app: `npm run build`
3. Sync to Android: `npm run android:sync`
4. Open in Android Studio: `npm run android:open`

## Building the Android App

### Using Android Studio (Recommended)

1. Open Android Studio
2. Open the `android/` folder in your project
3. Wait for Gradle sync to complete
4. Connect an Android device or start an emulator
5. Click the "Run" button (green play icon) or press `Shift+F10`

### Using Command Line

```bash
cd android
./gradlew assembleDebug
```

The APK will be generated at: `android/app/build/outputs/apk/debug/app-debug.apk`

### Building Release APK/AAB

1. **Create a keystore** (first time only):
```bash
keytool -genkey -v -keystore abcotronics-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias abcotronics
```

2. **Update `capacitor.config.js`** with your keystore details:
```javascript
android: {
  buildOptions: {
    keystorePath: 'path/to/abcotronics-release-key.jks',
    keystorePassword: 'your-keystore-password',
    keystoreAlias: 'abcotronics',
    keystoreAliasPassword: 'your-alias-password',
    releaseType: 'AAB' // or 'APK'
  }
}
```

3. **Build release**:
```bash
cd android
./gradlew bundleRelease  # For AAB (Google Play)
# or
./gradlew assembleRelease  # For APK
```

Release files will be at:
- AAB: `android/app/build/outputs/bundle/release/app-release.aab`
- APK: `android/app/build/outputs/apk/release/app-release.apk`

## App Configuration

### App ID and Name

Edit `capacitor.config.js` to change:
- `appId`: Your unique app identifier (e.g., `com.abcotronics.erp`)
- `appName`: Display name of your app

### App Icon

1. Generate app icons using a tool like:
   - https://www.appicon.co/
   - https://icon.kitchen/
   - Android Studio's Image Asset Studio

2. Replace icons in:
   - `android/app/src/main/res/mipmap-*/ic_launcher.png`
   - `android/app/src/main/res/mipmap-*/ic_launcher_round.png`

### Splash Screen

The splash screen is configured in `capacitor.config.js` under `plugins.SplashScreen`. You can customize:
- Background color
- Duration
- Logo/image

To add a custom splash image:
1. Add your image to `android/app/src/main/res/drawable/splash.png`
2. Update `androidSplashResourceName` in config

### Permissions

Edit `android/app/src/main/AndroidManifest.xml` to add required permissions:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<!-- Add more permissions as needed -->
```

## Troubleshooting

### "Command not found: cap"

Make sure Capacitor CLI is installed:
```bash
npm install -g @capacitor/cli
```

Or use npx:
```bash
npx cap sync android
```

### "SDK location not found"

Set the Android SDK path:
- **Mac/Linux**: Add to `~/.bashrc` or `~/.zshrc`:
  ```bash
  export ANDROID_HOME=$HOME/Library/Android/sdk
  export PATH=$PATH:$ANDROID_HOME/tools
  export PATH=$PATH:$ANDROID_HOME/platform-tools
  ```

- **Windows**: Add environment variables:
  - `ANDROID_HOME`: `C:\Users\YourUsername\AppData\Local\Android\Sdk`
  - Add to PATH: `%ANDROID_HOME%\tools` and `%ANDROID_HOME%\platform-tools`

### Build Errors

1. **Gradle sync failed**: 
   - Open Android Studio
   - File → Invalidate Caches / Restart
   - Try syncing again

2. **SDK version mismatch**:
   - Open `android/build.gradle`
   - Update `compileSdkVersion` and `targetSdkVersion` to match your SDK

3. **Java version error**:
   - Ensure JDK 17+ is installed
   - In Android Studio: File → Project Structure → SDK Location → JDK Location

### App Not Loading Web Content

1. Check that `dist/` directory exists and has files
2. Run `npm run android:sync` to copy files
3. Check `capacitor.config.js` - ensure `webDir` is set to `'dist'`
4. For development server, ensure URL is correct and device can reach it

### Network Issues (CORS, Mixed Content)

- The app allows mixed content by default (`allowMixedContent: true`)
- For API calls, ensure your backend allows requests from the app
- Check server CORS settings

## Updating the App

When you make changes to your web app:

1. Rebuild: `npm run build`
2. Sync: `npm run android:sync`
3. Rebuild Android app in Android Studio

## Publishing to Google Play

1. Build a release AAB: `./gradlew bundleRelease`
2. Create a Google Play Console account
3. Create a new app
4. Upload the AAB file
5. Fill in store listing, screenshots, etc.
6. Submit for review

## Useful Commands

```bash
# Initialize Android platform
npm run android:init

# Sync web assets to Android
npm run android:sync

# Open Android project in Android Studio
npm run android:open

# Build and sync in one command
npm run android:build

# Full workflow: build, sync, and open
npm run android:run
```

## Additional Resources

- [Capacitor Documentation](https://capacitorjs.com/docs)
- [Android Developer Guide](https://developer.android.com/guide)
- [Capacitor Android Plugin Guide](https://capacitorjs.com/docs/android)

## Notes

- The `android/` directory is generated and should be committed to version control
- Never edit files in `android/app/src/main/assets/public/` - they are overwritten by `cap sync`
- Always run `npm run android:sync` after building your web app
- For production, ensure your backend API is accessible from mobile devices (use HTTPS)

