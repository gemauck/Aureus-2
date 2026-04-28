#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

REMOTE_NAME="origin"
BRANCH_NAME="main"
DEPLOY_HOST="root@165.22.127.196"
DEPLOY_PATH="/var/www/abcotronics-erp"
REMOTE_MIN_FREE_MB="${REMOTE_MIN_FREE_MB:-4096}"
REMOTE_MIN_FREE_INODES="${REMOTE_MIN_FREE_INODES:-10000}"
REMOTE_PRE_DEPLOY_CLEANUP="${REMOTE_PRE_DEPLOY_CLEANUP:-0}"
REMOTE_BACKUP_RETENTION_COUNT="${REMOTE_BACKUP_RETENTION_COUNT:-14}"

echo "== Safe deploy guard =="
echo "Repo: $ROOT_DIR"
echo "Target: $REMOTE_NAME/$BRANCH_NAME"

current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$current_branch" != "$BRANCH_NAME" ]]; then
  echo "ERROR: You are on '$current_branch'. Switch to '$BRANCH_NAME' before deploying."
  exit 1
fi

echo "-> Fetching latest remote refs..."
git fetch "$REMOTE_NAME" --prune "$BRANCH_NAME"

ahead_count="$(git rev-list --count "$REMOTE_NAME/$BRANCH_NAME"..HEAD)"
behind_count="$(git rev-list --count HEAD.."$REMOTE_NAME/$BRANCH_NAME")"

if [[ "$behind_count" -gt 0 ]]; then
  echo "ERROR: Local branch is behind $REMOTE_NAME/$BRANCH_NAME by $behind_count commit(s)."
  echo "Please pull/rebase and resolve before deploying."
  exit 1
fi

if [[ "$ahead_count" -gt 0 ]]; then
  echo "-> Local branch is ahead by $ahead_count commit(s). Pushing before deploy..."
  git push "$REMOTE_NAME" "$BRANCH_NAME"
else
  echo "-> Local and remote are in sync. No push needed."
fi

echo "-> Triggering server deploy..."
ssh "$DEPLOY_HOST" "
  set -euo pipefail
  cd '$DEPLOY_PATH'
  free_mb=\$(df -Pm . | awk 'NR==2 {print \$4}')
  free_inodes=\$(df -Pi . | awk 'NR==2 {print \$4}')
  echo \"-> Remote capacity check: \${free_mb}MB free, \${free_inodes} inodes free\"
  if [ \"\${free_mb}\" -lt '$REMOTE_MIN_FREE_MB' ]; then
    echo \"ERROR: Remote free disk below threshold (${REMOTE_MIN_FREE_MB}MB). Aborting before fetch.\"
    exit 1
  fi
  if [ \"\${free_inodes}\" -lt '$REMOTE_MIN_FREE_INODES' ]; then
    echo \"ERROR: Remote free inodes below threshold (${REMOTE_MIN_FREE_INODES}). Aborting before fetch.\"
    exit 1
  fi
  git update-ref -d refs/remotes/origin/main 2>/dev/null || true
  git fetch origin --prune main
  git reset --hard origin/main
  MIN_FREE_MB='$REMOTE_MIN_FREE_MB' MIN_FREE_INODES='$REMOTE_MIN_FREE_INODES' PRE_DEPLOY_CLEANUP='$REMOTE_PRE_DEPLOY_CLEANUP' BACKUP_RETENTION_COUNT='$REMOTE_BACKUP_RETENTION_COUNT' ./deploy.sh
"

