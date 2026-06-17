#!/usr/bin/env bash
# Git over SSH (port 443) with HTTPS + credential-helper fallback when port 22 is blocked.
set -euo pipefail

git_https_url() {
  local remote="${1:-origin}"
  local url
  url="$(git remote get-url "$remote" 2>/dev/null || true)"
  [[ -n "$url" ]] || return 1

  case "$url" in
    git@github.com:*)
      echo "https://github.com/${url#git@github.com:}"
      ;;
    https://github.com/*)
      echo "$url"
      ;;
    *)
      return 1
      ;;
  esac
}

git_with_ssh443() {
  GIT_SSH_COMMAND='ssh -o Port=443 -o Hostname=ssh.github.com -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20' \
    git "$@"
}

git_fetch_safe() {
  local remote="${1:-origin}"
  local ref="${2:-}"
  local fetch_refs=()

  if [[ -n "$ref" ]]; then
    fetch_refs=("+refs/heads/${ref}:refs/remotes/${remote}/${ref}")
  fi

  echo "-> git fetch via SSH (${remote}${ref:+ $ref})..."
  if [[ ${#fetch_refs[@]} -gt 0 ]]; then
    git fetch "$remote" --prune "${fetch_refs[@]}" 2>/dev/null && return 0
  else
    git fetch "$remote" --prune 2>/dev/null && return 0
  fi

  echo "-> SSH fetch failed; retrying GitHub SSH on port 443..."
  if [[ ${#fetch_refs[@]} -gt 0 ]]; then
    git_with_ssh443 fetch "$remote" --prune "${fetch_refs[@]}" 2>/dev/null && return 0
  else
    git_with_ssh443 fetch "$remote" --prune 2>/dev/null && return 0
  fi

  local https_url
  https_url="$(git_https_url "$remote")" || {
    echo "ERROR: Could not resolve HTTPS URL for remote '$remote'."
    return 1
  }

  echo "-> Retrying fetch via HTTPS..."
  if [[ -n "${GITHUB_TOKEN:-${GH_TOKEN:-}}" ]]; then
    local token="${GITHUB_TOKEN:-$GH_TOKEN}"
    https_url="https://${token}@${https_url#https://}"
    if [[ ${#fetch_refs[@]} -gt 0 ]]; then
      git fetch "$https_url" --prune "${fetch_refs[@]}"
    else
      git fetch "$https_url" --prune
    fi
    return 0
  fi

  if [[ ${#fetch_refs[@]} -gt 0 ]]; then
    git -c credential.helper=store fetch "$https_url" --prune "${fetch_refs[@]}" 2>/dev/null && return 0
    git -c credential.helper=osxkeychain fetch "$https_url" --prune "${fetch_refs[@]}"
  else
    git -c credential.helper=store fetch "$https_url" --prune 2>/dev/null && return 0
    git -c credential.helper=osxkeychain fetch "$https_url" --prune
  fi
}

git_push_safe() {
  local remote="${1:-origin}"
  local branch="${2:-main}"

  echo "-> git push via SSH (${remote} ${branch})..."
  if git push "$remote" "$branch" 2>/dev/null; then
    return 0
  fi

  echo "-> SSH push failed; retrying GitHub SSH on port 443..."
  if git_with_ssh443 push "$remote" "$branch" 2>/dev/null; then
    return 0
  fi

  local https_url
  https_url="$(git_https_url "$remote")" || {
    echo "ERROR: Could not resolve HTTPS URL for remote '$remote'."
    return 1
  }

  echo "-> Retrying push via HTTPS..."
  if [[ -n "${GITHUB_TOKEN:-${GH_TOKEN:-}}" ]]; then
    local token="${GITHUB_TOKEN:-$GH_TOKEN}"
    https_url="https://${token}@${https_url#https://}"
    git push "$https_url" "$branch"
    return 0
  fi

  for helper in store osxkeychain; do
    if git -c credential.helper="$helper" push "$https_url" "$branch" 2>/dev/null; then
      return 0
    fi
  done

  cat >&2 <<EOF
ERROR: git push failed (SSH blocked and HTTPS auth failed).

Your ~/.git-credentials token may be expired. Fix options:
  1. Terminal: gh auth login && gh auth setup-git && git push origin main
  2. Terminal: git push origin main
  3. Export a fresh PAT: export GITHUB_TOKEN=ghp_... && npm run deploy

EOF
  return 1
}
