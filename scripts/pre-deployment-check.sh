#!/bin/bash
# Pre-Deployment Safety Check
# Run this before deploying to catch dangerous operations

set -e

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "🔍 Pre-Deployment Safety Check"
echo "==============================="
echo ""

ERRORS=0
WARNINGS=0

# Check for dangerous patterns in scripts
echo "📋 Checking deployment scripts for dangerous patterns..."

DANGEROUS_PATTERNS=(
    "--force-reset"
    "migrate reset"
    "prisma.*reset"
    "DROP TABLE"
    "TRUNCATE"
    "DELETE FROM"
)

for file in deploy-*.sh apply-*.sh migrate-*.sh setup-*.sh; do
    if [ -f "$file" ]; then
        echo "   Checking: $file"
        
        for pattern in "${DANGEROUS_PATTERNS[@]}"; do
            if grep -qE "$pattern" "$file" 2>/dev/null; then
                echo -e "${RED}   ❌ Found dangerous pattern: $pattern${NC}"
                echo "      File: $file"
                ERRORS=$((ERRORS + 1))
            fi
        done
        
        # Check for --accept-data-loss without backup
        if grep -qE "--accept-data-loss" "$file" 2>/dev/null; then
            if ! grep -qE "backup|pg_dump|dump" "$file" 2>/dev/null; then
                echo -e "${YELLOW}   ⚠️  Found --accept-data-loss without backup${NC}"
                echo "      File: $file"
                WARNINGS=$((WARNINGS + 1))
            fi
        fi
    fi
done

echo ""

# Check for backup commands
echo "📦 Checking for backup procedures..."

BACKUP_FOUND=false
for file in deploy-*.sh apply-*.sh migrate-*.sh; do
    if [ -f "$file" ]; then
        if grep -qi "backup\|pg_dump\|dump\|\.sql" "$file"; then
            BACKUP_FOUND=true
            break
        fi
    fi
done

if [ "$BACKUP_FOUND" = false ]; then
    echo -e "${YELLOW}⚠️  No backup procedures found in deployment scripts${NC}"
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${GREEN}✅ Backup procedures found${NC}"
fi

echo ""

# Check for DATABASE_URL in scripts
echo "🔐 Checking for hardcoded credentials..."

for file in deploy-*.sh apply-*.sh migrate-*.sh; do
    if [ -f "$file" ]; then
        if grep -qE "postgresql://.*:.*@" "$file" 2>/dev/null; then
            echo -e "${YELLOW}⚠️  Possible hardcoded credentials in: $file${NC}"
            WARNINGS=$((WARNINGS + 1))
        fi
    fi
done

echo ""

# Summary
echo "📊 Summary"
echo "=========="
echo -e "${GREEN}Warnings: $WARNINGS${NC}"
echo -e "${RED}Errors: $ERRORS${NC}"
echo ""

if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}❌ DEPLOYMENT BLOCKED: Dangerous patterns detected${NC}"
    echo ""
    echo "Please fix the issues above before deploying."
    exit 1
elif [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Warnings detected. Review before deploying.${NC}"
    exit 0
else
    echo -e "${GREEN}✅ All checks passed! Safe to deploy.${NC}"
    exit 0
fi

