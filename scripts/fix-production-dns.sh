#!/usr/bin/env bash
# Production DNS check - abcoafrica.co.za must point to the ERP server
# Run: bash scripts/fix-production-dns.sh

PROD_IP="165.22.127.196"
DOMAIN="abcoafrica.co.za"

echo "=== Production DNS Check ==="
echo "ERP server IP: $PROD_IP"
echo "Production URL: https://$DOMAIN"
echo ""

current=$(dig +short "$DOMAIN" 2>/dev/null | tail -1)
if [ -z "$current" ]; then
  echo "❌ $DOMAIN - No DNS record found"
  echo ""
  echo "Add A record: $DOMAIN → $PROD_IP"
elif [ "$current" = "$PROD_IP" ]; then
  echo "✅ $DOMAIN - Correct ($current)"
else
  echo "⚠️  $DOMAIN - WRONG: points to $current (should be $PROD_IP)"
  echo ""
  echo "Update A record: $DOMAIN → $PROD_IP"
fi
echo ""
