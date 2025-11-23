import { CapacitorConfig } from '@capacitor/cli';

const config = {
  appId: 'com.abcotronics.erp',
  appName: 'Abcotronics ERP',
  // webDir points to root since index.html is at root and references ./dist/
  // Capacitor will copy the entire directory, but we exclude unnecessary files via .gitignore
  webDir: '.',
  server: {
    // For development, you can point to your local server
    // For production, remove this to use the bundled files
    // url: 'http://localhost:5000',
    // cleartext: true
  },
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystorePassword: undefined,
      keystoreAlias: undefined,
      keystoreAliasPassword: undefined,
      releaseType: 'AAB' // or 'APK'
    },
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#0284c7",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true
    },
    Keyboard: {
      resize: "body",
      style: "dark",
      resizeOnFullScreen: true
    }
  }
};

export default config;

