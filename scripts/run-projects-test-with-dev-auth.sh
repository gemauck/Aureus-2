#!/usr/bin/env bash
# Run projects functionality/persistence tests against a server started with dev auth.
# Use when you don't have TEST_EMAIL/TEST_PASSWORD in .env.local.
# Starts server on port 3001 (TEST_PORT) with DEV_LOCAL_NO_DB=true, runs tests, then stops server.

set -e
cd "$(dirname "$0")/.."

export PORT=3001
export TEST_PORT=3001
export TEST_DEV_AUTH=true
export NODE_ENV=development

echo "Starting server on port $PORT with dev auth..."
node server.js &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null || true" EXIT

echo "Waiting for server..."
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/api/version" 2>/dev/null | grep -q 200; then
    echo "Server ready."
    break
  fi
  sleep 1
done

echo "Running projects tests..."
TEST_URL="http://localhost:$PORT" TEST_EMAIL=admin@example.com TEST_PASSWORD=password123 node tests/projects-functionality-persistence-tests.js
exit $?
