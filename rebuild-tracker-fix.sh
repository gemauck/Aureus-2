#!/bin/bash

# QUICK FIX: Rebuild MonthlyDocumentCollectionTracker
# This fixes the modal closing issue when clicking "Add Section"

echo "🔧 Rebuilding MonthlyDocumentCollectionTracker with modal fix..."
echo ""
echo "This will:"
echo "  ✓ Pause LiveDataSync when modals are open"
echo "  ✓ Prevent background data fetches from closing forms"
echo "  ✓ Resume LiveDataSync when modals close"
echo ""

# Step 1: Rebuild JSX components
echo "📦 Step 1: Rebuilding JSX components..."
npm run build:jsx

if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    echo ""
    
    # Step 2: Check the output
    echo "📋 Step 2: Verifying build output..."
    TRACKER_FILE="dist/src/components/projects/MonthlyDocumentCollectionTracker.js"
    
    if [ -f "$TRACKER_FILE" ]; then
        echo "✅ MonthlyDocumentCollectionTracker.js rebuilt"
        echo "   File: $TRACKER_FILE"
        echo "   Size: $(ls -lh "$TRACKER_FILE" | awk '{print $5}')"
        echo "   Modified: $(ls -l "$TRACKER_FILE" | awk '{print $6, $7, $8}')"
        echo ""
        
        # Check if the fix is in the file
        if grep -q "Pausing LiveDataSync" "$TRACKER_FILE"; then
            echo "✅ Fix verified - LiveDataSync pause code is present"
            echo ""
            echo "🎉 SUCCESS! The fix has been applied."
            echo ""
            echo "📝 Next steps:"
            echo "   1. Refresh your browser (Cmd+Shift+R or Ctrl+Shift+R)"
            echo "   2. Open a project with Document Collection"
            echo "   3. Click 'Add Section' - modal should stay open"
            echo "   4. Check console for: '🛑 Pausing LiveDataSync - modal is open'"
            echo ""
            echo "📤 To deploy to production:"
            echo "   npm run deploy"
            echo ""
        else
            echo "⚠️  Warning: Fix code not found in built file"
            echo "   The build may have failed partially"
            echo "   Try rebuilding from src directly"
        fi
    else
        echo "❌ Error: Output file not found at $TRACKER_FILE"
        echo "   Build may have failed"
    fi
else
    echo "❌ Build failed!"
    echo "   Check the error messages above"
    echo "   Try running: npm install"
    exit 1
fi

echo ""
echo "📚 For more details, see: MODAL-REFRESH-FIX.md"
