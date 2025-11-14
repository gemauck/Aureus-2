#!/bin/bash
# Convert old-style React component to Vite style

if [ -z "$1" ]; then
    echo "Usage: ./convert-component.sh ComponentName.jsx"
    exit 1
fi

FILE="src/components/$1"

if [ ! -f "$FILE" ]; then
    echo "File not found: $FILE"
    exit 1
fi

echo "Converting $FILE to Vite style..."

# Create backup
cp "$FILE" "$FILE.backup"

# Remove IIFE wrapper - start
sed -i.tmp '1,/^(() => {$/d' "$FILE"

# Remove IIFE wrapper - end
sed -i.tmp '/^})();$/d' "$FILE"

# Convert React destructuring
sed -i.tmp 's/const { \([^}]*\) } = React;/import React, { \1 } from "react";/' "$FILE"

# Remove window assignments
sed -i.tmp '/window\.\w\+ = /d' "$FILE"

# Add export to main component
sed -i.tmp 's/const \(\w\+\) = (/export function \1(/' "$FILE"

# Clean up temp files
rm -f "$FILE.tmp"

echo "✅ Converted! Original backed up to $FILE.backup"
echo "⚠️  Manual review needed:"
echo "   1. Check imports are correct"
echo "   2. Verify exports"
echo "   3. Test in browser"
