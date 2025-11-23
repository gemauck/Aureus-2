# Android App - Quick Start Guide

## 🚀 Quick Setup (5 minutes)

### Step 1: Install Prerequisites
- **Java JDK 17+**: Download from [Adoptium](https://adoptium.net/)
- **Android Studio**: Download from [developer.android.com/studio](https://developer.android.com/studio)

### Step 2: Run Setup Script
```bash
./setup-android.sh
```

This will:
- ✅ Install Capacitor dependencies
- ✅ Build your web app
- ✅ Initialize Android platform
- ✅ Sync files to Android

### Step 3: Open in Android Studio
```bash
npm run android:open
```

### Step 4: Run the App
1. In Android Studio, click the green "Run" button
2. Select an emulator or connected device
3. Wait for the app to build and launch

## 📱 Development Workflow

### After Making Web Changes:
```bash
npm run build          # Build web app
npm run android:sync   # Copy to Android
# Then rebuild in Android Studio
```

### Quick Commands:
```bash
npm run android:sync   # Sync web files to Android
npm run android:open   # Open in Android Studio
npm run android:build # Build + Sync in one command
```

## 🔧 Common Issues

### "SDK location not found"
Set environment variable:
```bash
export ANDROID_HOME=$HOME/Library/Android/sdk  # Mac
export ANDROID_HOME=$HOME/Android/Sdk          # Linux
```

### "Command not found: cap"
Use npx:
```bash
npx cap sync android
```

### App shows blank screen
1. Check that `dist/` folder exists
2. Run `npm run build`
3. Run `npm run android:sync`

## 📦 Building for Release

### Debug APK (for testing):
```bash
cd android
./gradlew assembleDebug
# APK at: android/app/build/outputs/apk/debug/app-debug.apk
```

### Release APK/AAB (for Google Play):
1. Create keystore (one time):
```bash
keytool -genkey -v -keystore release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias abcotronics
```

2. Update `capacitor.config.js` with keystore details

3. Build:
```bash
cd android
./gradlew bundleRelease  # For Google Play (AAB)
# or
./gradlew assembleRelease  # For direct install (APK)
```

## 📚 Full Documentation

See [ANDROID-SETUP.md](./ANDROID-SETUP.md) for complete instructions.

## 🆘 Need Help?

- Check [ANDROID-SETUP.md](./ANDROID-SETUP.md) for detailed troubleshooting
- [Capacitor Docs](https://capacitorjs.com/docs)
- [Android Developer Docs](https://developer.android.com/guide)

