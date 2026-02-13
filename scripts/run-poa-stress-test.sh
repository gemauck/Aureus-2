#!/usr/bin/env bash
# Start server with dev auth, run POA Review stress test, then stop server.
# Usage: ./scripts/run-poa-stress-test.sh [ROWS]
#   ROWS default: 25000 (set POA_STRESS_ROWS=100000 for heavy stress)

set -e
cd "$(dirname "$0")/.."

export PORT=${TEST_PORT:-3001}
export TEST_DEV_AUTH=true
export NODE_ENV=development
ROWS=${1:-${POA_STRESS_ROWS:-25000}}

echo "Starting server on port $PORT with dev auth..."
node server.js &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null || true" EXIT

echo "Waiting for server..."
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/version" 2>/dev/null | grep -q 200; then
    echo "Server ready."
    break
  fi
  sleep 1
done

echo "Running POA stress test ($ROWS rows)..."
POA_STRESS_BASE_URL="http://localhost:$PORT" POA_STRESS_ROWS="$ROWS" node scripts/stress-test-poa-review.js
exit $?
