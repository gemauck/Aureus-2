#!/usr/bin/env bash
# One-time setup: create local PostgreSQL user and database for ERP.
# Run from project root. You'll be prompted for your postgres superuser password.

set -e
DB_NAME="abcotronics_erp_local"
DB_USER="gemau"
DB_PASSWORD="${DB_PASSWORD:-localdev}"
PORT="${PGPORT:-5432}"

echo "Local DB setup: $DB_USER @ localhost:$PORT / $DB_NAME"
echo ""

if ! command -v psql >/dev/null 2>&1; then
  echo "psql not found. Install PostgreSQL client or use Postgres.app."
  exit 1
fi

echo "Creating user '$DB_USER' and database '$DB_NAME'..."
echo "(You may be prompted for the postgres superuser password.)"
echo ""

# Create user (ignore error if exists)
PGPASSWORD="${POSTGRES_PASSWORD}" psql -h localhost -p "$PORT" -U postgres -d postgres -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD' CREATEDB;" 2>/dev/null || true

# Create database (ignore error if exists)
PGPASSWORD="${POSTGRES_PASSWORD}" psql -h localhost -p "$PORT" -U postgres -d postgres -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" 2>/dev/null || true

echo ""
echo "Done. Update .env.local:"
echo "  DATABASE_URL=\"postgresql://${DB_USER}:${DB_PASSWORD}@localhost:${PORT}/${DB_NAME}\""
echo "  DEV_LOCAL_NO_DB=false"
echo ""
echo "Then run: npx prisma db push"
echo "Then start the app: npm run dev:backend"
