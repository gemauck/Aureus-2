#!/bin/bash
# One-shot: dump cloud DATABASE_URL from .env and restore into local abcotronics_erp_local.
# Usage: ./scripts/sync-local-db-from-production.sh [--yes]
# Requires: PostgreSQL client tools, .env with production DATABASE_URL, socket access to local Postgres.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PSQL="${PSQL:-/Library/PostgreSQL/18/bin/psql}"
PG_DUMP="${PG_DUMP:-/Library/PostgreSQL/18/bin/pg_dump}"
CREATEDB="${CREATEDB:-/Library/PostgreSQL/18/bin/createdb}"
DROPDB="${DROPDB:-/Library/PostgreSQL/18/bin/dropdb}"

DB_NAME="abcotronics_erp_local"
LOCAL_DB_URL="postgresql://${USER}@/${DB_NAME}?host=/tmp"
AUTO_YES="${1:-}"

if [ ! -f .env ]; then
  echo "❌ .env not found (need DATABASE_URL for cloud dump)"
  exit 1
fi

PROD_DB_URL="$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
if [ -z "$PROD_DB_URL" ]; then
  echo "❌ DATABASE_URL missing in .env"
  exit 1
fi

echo "This will replace local database \"${DB_NAME}\" with a fresh copy from your .env DATABASE_URL (cloud)."
echo "Local app will use .env.local (created/updated by setup-local-dev.sh or this run)."
echo ""
if [ "$AUTO_YES" != "--yes" ]; then
  read -p "Continue? (y/N): " -n 1 -r
  echo
  [[ $REPLY =~ ^[Yy]$ ]] || { echo "Cancelled"; exit 0; }
fi

DUMP_FILE="/tmp/abcotronics_prod_dump_$(date +%Y%m%d_%H%M%S).sql"
echo "📦 Dumping cloud database (this may take several minutes)..."
# --no-owner/--no-acl: cloud roles (e.g. doadmin) do not exist locally
"$PG_DUMP" "$PROD_DB_URL" -F p --no-owner --no-acl -f "$DUMP_FILE"
DUMP_SIZE="$(du -h "$DUMP_FILE" | cut -f1)"
echo "✅ Dump saved (${DUMP_SIZE}): ${DUMP_FILE}"

echo "🗄️  Recreating local database ${DB_NAME}..."
"$PSQL" -d postgres -v ON_ERROR_STOP=1 -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" \
  2>/dev/null || true
"$DROPDB" --if-exists "$DB_NAME" 2>/dev/null || "$PSQL" -d postgres -c "DROP DATABASE IF EXISTS ${DB_NAME};"
"$CREATEDB" "$DB_NAME" 2>/dev/null || "$PSQL" -d postgres -c "CREATE DATABASE ${DB_NAME} OWNER ${USER};"

echo "📤 Restoring into local database..."
"$PSQL" "$LOCAL_DB_URL" -v ON_ERROR_STOP=0 -f "$DUMP_FILE" > /tmp/abcotronics_restore.log 2>&1 || true
if grep -E '^psql:.* FATAL:|^psql:.* ERROR:.*' /tmp/abcotronics_restore.log | grep -v 'already exists' | head -5; then
  echo "⚠️  Restore finished with some errors (see /tmp/abcotronics_restore.log). Common benign: role/owner mismatches."
else
  echo "✅ Restore complete"
fi
rm -f "$DUMP_FILE"

if [ ! -f .env.local ]; then
  echo "📝 Creating .env.local..."
  bash scripts/setup-local-dev-noninteractive.sh
else
  echo "✅ .env.local already present"
fi

npx prisma generate --schema=./prisma/schema.prisma >/dev/null
echo ""
echo "✅ Local DB is now a copy of cloud data. Start with: npm run dev:backend"
echo "   Local DATABASE_URL: ${LOCAL_DB_URL}"
