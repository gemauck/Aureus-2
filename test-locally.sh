#!/bin/bash

# Quick Local Test Script
echo "🧪 Running Quick Local Tests..."

# Start local server in background
echo "Starting local server..."
python3 -m http.server 8080 &
SERVER_PID=$!

# Wait for server to start
sleep 2

echo "✅ Local server started on http://localhost:8080"
echo ""
echo "🔗 Test URLs:"
echo "   Main App: http://localhost:8080/index.html"
echo "   Fixes Test: http://localhost:8080/test-fixes.html"
echo ""
echo "📋 Manual Testing Steps:"
echo "1. Open http://localhost:8080/index.html"
echo "2. Login with admin@abcotronics.com"
echo "3. Navigate to Teams section - should load without errors"
echo "4. Navigate to Projects section - should load without errors"
echo "5. Click on a project - ProjectDetail should load without errors"
echo "6. Check browser console for any JavaScript errors"
echo ""
echo "✅ Expected Results:"
echo "   - No 'getTeamDocuments is not a function' errors"
echo "   - No 'storage.getClients is not a function' errors"
echo "   - No 'storage.getProjects is not a function' errors"
echo "   - All components should load and function properly"
echo ""
echo "Press Ctrl+C to stop the server when done testing"

# Keep script running
trap "echo 'Stopping server...'; kill $SERVER_PID; exit" INT
wait $SERVER_PID
