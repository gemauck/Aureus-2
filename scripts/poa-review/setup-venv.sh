#!/usr/bin/env bash
# Create or refresh venv-poareview for POA Review server-side processing (pandas, openpyxl).
# Run from project root: ./scripts/poa-review/setup-venv.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VENV="$ROOT/venv-poareview"
PY="$VENV/bin/python3"
PIP="$VENV/bin/pip"

echo "Project root: $ROOT"

if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python3 is not installed."
  exit 1
fi

if [ -d "$VENV" ]; then
  if [ ! -x "$PY" ] || ! "$PY" -c "import sys" 2>/dev/null; then
    echo "Removing broken venv (missing or invalid python at $PY)..."
    rm -rf "$VENV"
  fi
fi

if [ ! -d "$VENV" ]; then
  echo "Creating venv at: $VENV"
  if ! python3 -m venv "$VENV"; then
    echo "ERROR: failed to create venv. On Debian/Ubuntu try:"
    echo "  sudo apt-get update && sudo apt-get install -y python3-venv python3-pip"
    exit 1
  fi
else
  echo "Using existing venv: $VENV"
fi

echo "Installing POA Review Python dependencies..."
"$PIP" install --upgrade pip
"$PIP" install pandas openpyxl

echo "Verifying imports..."
"$PY" -c "import pandas; import openpyxl; print('OK: pandas', pandas.__version__, 'openpyxl', openpyxl.__version__)"

echo "Done. POA Review APIs will use: $PY"
