#!/usr/bin/env bash
# Overwrite OPENAI_API_KEY on the production ERP server (.env) and restart PM2.
#
# Option A — key in repo .env (gitignored):
#   Put OPENAI_API_KEY=sk-proj-... in the project root .env, then:
#   ./scripts/push-openai-key-to-production.sh
#
# Option B — export in shell:
#   export OPENAI_API_KEY='sk-proj-...'
#   ./scripts/push-openai-key-to-production.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -z "${OPENAI_API_KEY:-}" ] && [ -f "$ROOT/.env" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^OPENAI_API_KEY= ]] || continue
    OPENAI_API_KEY="${line#OPENAI_API_KEY=}"
    OPENAI_API_KEY="${OPENAI_API_KEY#\"}"
    OPENAI_API_KEY="${OPENAI_API_KEY%\"}"
    OPENAI_API_KEY="${OPENAI_API_KEY#\'}"
    OPENAI_API_KEY="${OPENAI_API_KEY%\'}"
    export OPENAI_API_KEY
    break
  done < "$ROOT/.env"
fi

if [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "Missing OPENAI_API_KEY. Add it to $ROOT/.env (see comment there) or export it, then run again." >&2
  exit 1
fi

HOST="${DEPLOY_SSH_HOST:-root@165.22.127.196}"
ENV_PATH="/var/www/abcotronics-erp/.env"

ESCAPED="$(printf '%q' "$OPENAI_API_KEY")"

echo "Updating $ENV_PATH on $HOST (removing old OPENAI_API_KEY lines, appending new one)…"

ssh -o BatchMode=yes "$HOST" "grep -v '^OPENAI_API_KEY=' ${ENV_PATH} > /tmp/erp.env.\$\$ && mv /tmp/erp.env.\$\$ ${ENV_PATH} && echo OPENAI_API_KEY=${ESCAPED} >> ${ENV_PATH}"

ssh -o BatchMode=yes "$HOST" "pm2 restart abcotronics-erp"

echo "Done. PM2 abcotronics-erp restarted."
