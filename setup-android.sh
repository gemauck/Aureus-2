#!/bin/bash

# Android Setup Script for Abcotronics ERP
# This script automates the initial setup of the Android app

set -e

echo "🚀 Setting up Android app for Abcotronics ERP..."
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

echo "✅ Node.js found: $(node --version)"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ npm found: $(npm --version)"
echo ""

# Install dependencies
echo "📦 Installing npm dependencies..."
npm install

echo ""
echo "🏗️  Building web application..."
npm run build

echo ""
echo "📱 Initializing Android platform..."
npx cap add android

echo ""
echo "🔄 Syncing web assets to Android..."
npx cap sync android

echo ""
echo "✅ Android setup complete!"
echo ""
echo "Next steps:"
echo "1. Install Android Studio from https://developer.android.com/studio"
echo "2. Open Android Studio and install Android SDK (API 33+)"
echo "3. Set ANDROID_HOME environment variable"
echo "4. Run: npm run android:open"
echo ""
echo "For detailed instructions, see ANDROID-SETUP.md"

