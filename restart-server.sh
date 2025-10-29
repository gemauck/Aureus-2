#!/bin/bash
# Script to restart the server

echo "🛑 Stopping any existing server on port 3000..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || echo "No server running"

echo "⏳ Waiting 2 seconds..."
sleep 2

echo "🚀 Starting server..."
npm start

