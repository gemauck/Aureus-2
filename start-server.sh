#!/bin/bash

# Navigate to the project directory
cd "$(dirname "$0")"

# Kill any existing server on port 8000
lsof -ti:8000 | xargs kill -9 2>/dev/null

# Start the server
echo "🚀 Starting Abcotronics ERP Server..."
python3 server.py
