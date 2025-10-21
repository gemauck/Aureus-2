#!/bin/bash

echo "🚀 Building Abcotronics ERP for Production..."

# Build CSS
echo "🎨 Building CSS..."
npm run build:css

# Create production-ready index.html without Babel transformer warnings
echo "📝 Creating production index.html..."
cp index.html index-production.html

# Replace Babel transformer with production-ready version
sed -i.bak 's/type="text\/babel"/type="module"/g' index-production.html

echo "✅ Production build completed!"
echo "📁 Files created:"
echo "   - dist/styles.css (compiled CSS)"
echo "   - index-production.html (production-ready HTML)"

echo ""
echo "🔧 To use production build:"
echo "   1. Update server to serve index-production.html as index.html"
echo "   2. Ensure all scripts are pre-compiled"
echo "   3. Test in production environment"
