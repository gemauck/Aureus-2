#!/bin/bash

# Restore PostgreSQL Database Configuration
echo "🔄 Restoring PostgreSQL database configuration..."

# Restore original schema
cp prisma/schema-postgres.prisma prisma/schema.prisma

# Remove SQLite files
rm -f prisma/schema-sqlite.prisma
rm -f dev.db

echo "✅ PostgreSQL configuration restored"
echo "📝 Remember to set up your DATABASE_URL environment variable"
echo "   Example: DATABASE_URL=\"postgresql://user:password@host:port/database\""
