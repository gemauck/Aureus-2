#!/usr/bin/env bash
# Create venv-poareview and install deps for POA Review server-side Excel processing.
# Run from project root: ./scripts/poa-review/setup-venv.sh

set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VENV="$ROOT/venv-poareview"

echo "Project root: $ROOT"
echo "Creating venv at: $VENV"

python3 -m venv "$VENV"
"$VENV/bin/pip" install --upgrade pip
"$VENV/bin/pip" install pandas openpyxl

echo "Done. POA Review will use $VENV/bin/python3 for server-side Excel processing."
