#!/usr/bin/env bash
# Patch production nginx: serve /dist/ and /vite-projects/ from disk (not Node) to avoid 502 under load.
set -euo pipefail

CONFIG="${1:-/etc/nginx/sites-available/abcotronics-erp}"
APP_ROOT="${2:-/var/www/abcotronics-erp}"

if [[ ! -f "$CONFIG" ]]; then
  echo "ERROR: nginx config not found: $CONFIG"
  exit 1
fi

if grep -q 'alias /var/www/abcotronics-erp/dist/;' "$CONFIG" 2>/dev/null; then
  echo "Already patched: $CONFIG serves /dist/ from disk"
  exit 0
fi

cp "$CONFIG" "${CONFIG}.bak.$(date +%Y%m%d%H%M%S)"

python3 - "$CONFIG" "$APP_ROOT" <<'PY'
import sys
from pathlib import Path

config_path = Path(sys.argv[1])
app_root = sys.argv[2]
text = config_path.read_text()

block = f"""
    # Serve built assets from disk (not Node — avoids 502 when app is busy)
    location ^~ /dist/ {{
        alias {app_root}/dist/;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }}

    location ^~ /vite-projects/ {{
        alias {app_root}/dist/vite-projects/;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }}

"""

marker = "    location ~* \\.(js|jsx)$"
if marker not in text:
    marker = "    # Proxy to Node.js app\n    location / {"
    if marker not in text:
        marker = "    location / {"
        if marker not in text:
            print("ERROR: could not find insertion point in nginx config", file=sys.stderr)
            sys.exit(1)

text = text.replace(marker, block + marker, 1)
config_path.write_text(text)
print(f"Patched {config_path}")
PY

nginx -t
systemctl reload nginx
echo "✅ nginx reloaded — /dist/ and /vite-projects/ now served from disk"
