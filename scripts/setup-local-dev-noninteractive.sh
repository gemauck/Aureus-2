#!/bin/bash
# Non-interactive: create .env.local for local Postgres (socket) without prompts.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DB_NAME="abcotronics_erp_local"
LOCAL_DB_URL="postgresql://${USER}@/${DB_NAME}?host=/tmp"

if ! /Library/PostgreSQL/18/bin/pg_isready -q 2>/dev/null && ! pg_isready -q 2>/dev/null; then
  echo "❌ PostgreSQL is not running"
  exit 1
fi

PSQL="${PSQL:-/Library/PostgreSQL/18/bin/psql}"
CREATEDB="${CREATEDB:-/Library/PostgreSQL/18/bin/createdb}"

if ! "$PSQL" -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "${DB_NAME}"; then
  "$CREATEDB" "$DB_NAME" 2>/dev/null || "$PSQL" -d postgres -c "CREATE DATABASE ${DB_NAME} OWNER ${USER};"
fi

JWT_FROM_ENV="$(node -e "
  import dotenv from 'dotenv';
  dotenv.config({ path: '.env' });
  console.log(process.env.JWT_SECRET || 'dev-local-jwt-secret-change-me');
")"

cat > .env.local << EOF
# Local development — overrides .env (never use on production server)
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:3000

# Local PostgreSQL (unix socket — no TCP password)
DATABASE_URL="${LOCAL_DB_URL}"

JWT_SECRET="${JWT_FROM_ENV}"
JWT_EXPIRY=24h

DEV_LOCAL_NO_DB=false
EOF

echo "✅ Wrote .env.local (DATABASE_URL → local ${DB_NAME})"
