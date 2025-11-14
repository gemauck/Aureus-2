#!/bin/bash

# Migrate ONLY Projects Section to Vite
# Everything else stays in current system

set -e

echo "🚀 Migrating Projects Module to Vite"
echo "===================================="
echo ""

# Check we're in right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Run this from project root"
    exit 1
fi

echo "📦 Step 1: Installing Vite (if not already installed)..."
npm install --save-dev vite @vitejs/plugin-react

echo ""
echo "📁 Step 2: Creating Vite project structure..."

# Create minimal Vite structure
mkdir -p vite-modules/projects/src
mkdir -p vite-modules/projects/public

echo ""
echo "📝 Step 3: Creating Vite config for Projects module..."

# Vite config
cat > vite-modules/projects/vite.config.js << 'EOF'
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  
  server: {
    port: 3001,  // Different port from main app
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  
  build: {
    outDir: '../../dist/vite-projects',  // Separate output
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Single file for easy inclusion
        entryFileNames: 'projects-module.js',
        chunkFileNames: 'projects-[name].js',
        assetFileNames: 'projects-[name].[ext]'
      }
    }
  },
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
EOF

echo ""
echo "📝 Step 4: Creating HTML entry point..."

cat > vite-modules/projects/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Projects Module (Vite)</title>
  </head>
  <body>
    <div id="vite-projects-root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
EOF

echo ""
echo "📝 Step 5: Creating React entry point..."

cat > vite-modules/projects/src/main.jsx << 'EOF'
import React from 'react';
import ReactDOM from 'react-dom/client';
import ProjectsModule from './ProjectsModule';
import '../../../src/styles/main.css';  // Use existing Tailwind

// Mount the Projects module
const container = document.getElementById('vite-projects-root');
if (container) {
  ReactDOM.createRoot(container).render(
    <React.StrictMode>
      <ProjectsModule />
    </React.StrictMode>
  );
}

// Also expose to window for backwards compatibility with old system
window.ViteProjects = ProjectsModule;
console.log('✅ Vite Projects module loaded');
EOF

echo ""
echo "📝 Step 6: Creating Projects module wrapper..."

cat > vite-modules/projects/src/ProjectsModule.jsx << 'EOF'
import React from 'react';
import Projects from './components/Projects';
import ProjectDetail from './components/ProjectDetail';

// This is the main Projects module component
// It will replace the old Projects component
export default function ProjectsModule() {
  const [selectedProject, setSelectedProject] = React.useState(null);
  
  if (selectedProject) {
    return (
      <ProjectDetail 
        project={selectedProject}
        onBack={() => setSelectedProject(null)}
      />
    );
  }
  
  return (
    <Projects 
      onProjectClick={setSelectedProject}
    />
  );
}
EOF

echo ""
echo "📝 Step 7: Copying Projects components..."

# Copy Projects components from src to vite-modules
mkdir -p vite-modules/projects/src/components

echo "   Copying Projects.jsx..."
if [ -f "src/components/projects/Projects.jsx" ]; then
    cp src/components/projects/Projects.jsx vite-modules/projects/src/components/
    echo "   ✅ Projects.jsx copied"
else
    echo "   ⚠️  Projects.jsx not found"
fi

echo "   Copying ProjectDetail.jsx..."
if [ -f "src/components/projects/ProjectDetail.jsx" ]; then
    cp src/components/projects/ProjectDetail.jsx vite-modules/projects/src/components/
    echo "   ✅ ProjectDetail.jsx copied"
else
    echo "   ⚠️  ProjectDetail.jsx not found"
fi

echo "   Copying MonthlyDocumentCollectionTracker.jsx..."
if [ -f "src/components/projects/MonthlyDocumentCollectionTracker.jsx" ]; then
    cp src/components/projects/MonthlyDocumentCollectionTracker.jsx vite-modules/projects/src/components/
    echo "   ✅ MonthlyDocumentCollectionTracker.jsx copied"
else
    echo "   ⚠️  MonthlyDocumentCollectionTracker.jsx not found"
fi

echo ""
echo "📝 Step 8: Creating conversion script..."

cat > vite-modules/projects/convert-component.sh << 'EOF'
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
EOF

chmod +x vite-modules/projects/convert-component.sh

echo ""
echo "📝 Step 9: Updating package.json scripts..."

# Add Vite scripts to package.json
node << 'NODESCRIPT'
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

pkg.scripts = {
  ...pkg.scripts,
  "dev:vite-projects": "cd vite-modules/projects && vite",
  "build:vite-projects": "cd vite-modules/projects && vite build",
  "preview:vite-projects": "cd vite-modules/projects && vite preview"
};

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
console.log('✅ Scripts added to package.json');
NODESCRIPT

echo ""
echo "============================================"
echo "✅ VITE PROJECTS MODULE SETUP COMPLETE!"
echo "============================================"
echo ""
echo "📁 Created structure:"
echo "   vite-modules/projects/"
echo "   ├── vite.config.js"
echo "   ├── index.html"
echo "   └── src/"
echo "       ├── main.jsx"
echo "       ├── ProjectsModule.jsx"
echo "       └── components/ (copied from src/)"
echo ""
echo "🔧 Next steps:"
echo ""
echo "1. Convert components to Vite style:"
echo "   cd vite-modules/projects"
echo "   ./convert-component.sh Projects.jsx"
echo "   ./convert-component.sh ProjectDetail.jsx"
echo "   ./convert-component.sh MonthlyDocumentCollectionTracker.jsx"
echo ""
echo "2. Start Vite dev server:"
echo "   npm run dev:vite-projects"
echo ""
echo "3. Visit: http://localhost:3001"
echo ""
echo "4. When ready, integrate into main app"
echo "   (Instructions in INTEGRATE-VITE-PROJECTS.md)"
echo ""
