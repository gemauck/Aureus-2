#!/usr/bin/env bash
# Fix production DNS - app.abcotronics.co.za must point to the ERP server
# Run: bash scripts/fix-production-dns.sh

PROD_IP="165.22.127.196"
DOMAINS="app.abcotronics.co.za erp.abcotronics.co.za"

echo "=== Production DNS Check ==="
echo "ERP server IP: $PROD_IP"
echo ""

for domain in $DOMAINS; do
  current=$(dig +short "$domain" 2>/dev/null | tail -1)
  if [ -z "$current" ]; then
    echo "❌ $domain - No DNS record found"
  elif [ "$current" = "$PROD_IP" ]; then
    echo "✅ $domain - Correct ($current)"
  else
    echo "⚠️  $domain - WRONG: points to $current (should be $PROD_IP)"
  fi
done

echo ""
echo "If any domain shows wrong IP, update DNS at your registrar:"
echo "  - Add/update A record: $DOMAINS → $PROD_IP"
echo "  - TTL: 300 (5 min) for quick propagation"
echo ""
echo "After DNS propagates (5-30 min), site should load at https://app.abcotronics.co.za"
echo ""
