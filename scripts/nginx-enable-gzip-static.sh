#!/usr/bin/env bash
# Enable gzip for JS/CSS/JSON and serve pre-compressed .gz assets from /dist/ (nginx gzip_static).
set -euo pipefail

NGINX_MAIN="${1:-/etc/nginx/nginx.conf}"
SITE_CONFIG="${2:-/etc/nginx/sites-available/abcotronics-erp}"
DIST_DIR="${3:-/var/www/abcotronics-erp/dist}"

if [[ ! -f "$NGINX_MAIN" ]]; then
  echo "ERROR: nginx main config not found: $NGINX_MAIN"
  exit 1
fi

if [[ ! -f "$SITE_CONFIG" ]]; then
  echo "ERROR: site config not found: $SITE_CONFIG"
  exit 1
fi

cp "$NGINX_MAIN" "${NGINX_MAIN}.bak.$(date +%Y%m%d%H%M%S)"
cp "$SITE_CONFIG" "${SITE_CONFIG}.bak.$(date +%Y%m%d%H%M%S)"

python3 - "$NGINX_MAIN" <<'PY'
import re
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text()

replacements = {
    r'#\s*gzip_vary on;': 'gzip_vary on;',
    r'#\s*gzip_proxied any;': 'gzip_proxied any;',
    r'#\s*gzip_comp_level 6;': 'gzip_comp_level 6;',
    r'#\s*gzip_buffers 16 8k;': 'gzip_buffers 16 8k;',
    r'#\s*gzip_http_version 1.1;': 'gzip_http_version 1.1;',
    r'#\s*gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml\+rss text/javascript;':
        'gzip_types text/plain text/css application/json application/javascript text/javascript application/x-javascript application/xml application/xml+rss image/svg+xml;',
}

for pattern, repl in replacements.items():
    text, count = re.subn(pattern, repl, text, count=1)
    if count:
        print(f"patched {path}: {repl.split(';')[0]}")

if 'gzip_min_length' not in text:
    text = text.replace('gzip on;', 'gzip on;\n\tgzip_min_length 256;', 1)
    print(f"added gzip_min_length to {path}")

path.write_text(text)
PY

python3 - "$SITE_CONFIG" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text()
needle = '    location ^~ /dist/ {'
if 'gzip_static on;' not in text and needle in text:
    text = text.replace(
        needle,
        needle + '\n        gzip_static on;\n        gzip_vary on;',
        1,
    )
    path.write_text(text)
    print(f"enabled gzip_static in {path}")
elif 'gzip_static on;' in text:
    print(f"gzip_static already enabled in {path}")
else:
    print(f"WARN: could not find /dist/ block in {path}", file=sys.stderr)
    sys.exit(1)
PY

if [[ -d "$DIST_DIR" ]]; then
  echo "-> Pre-compressing dist assets in $DIST_DIR"
  find "$DIST_DIR" -type f \( -name '*.js' -o -name '*.css' -o -name '*.json' \) ! -name '*.gz' -print0 \
    | while IFS= read -r -d '' f; do
        gzip -kf9 "$f"
      done
fi

nginx -t
systemctl reload nginx
echo "✅ nginx gzip enabled and dist .gz files refreshed"
