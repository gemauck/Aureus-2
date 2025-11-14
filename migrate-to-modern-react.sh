#!/bin/bash

# Automated Migration to Modern React Architecture
# This script creates a new Vite-based frontend structure

set -e  # Exit on error

echo "🚀 Abcotronics ERP - Migration to Modern React Architecture"
echo "============================================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: package.json not found. Run this from project root.${NC}"
    exit 1
fi

echo -e "${YELLOW}⚠️  This will create a new 'frontend/' directory with modern React setup${NC}"
echo -e "${YELLOW}   Your current files will NOT be deleted.${NC}"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Migration cancelled."
    exit 0
fi

echo ""
echo "📦 Step 1: Installing modern dependencies..."
npm install --save-dev vite @vitejs/plugin-react concurrently
npm install react@^18 react-dom@^18 react-router-dom@^6

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Dependencies installed${NC}"
else
    echo -e "${RED}❌ Failed to install dependencies${NC}"
    exit 1
fi

echo ""
echo "📁 Step 2: Creating new frontend structure..."

# Create frontend directory structure
mkdir -p frontend/src/{components,hooks,services,utils,styles,contexts}
mkdir -p frontend/public
mkdir -p backend

echo -e "${GREEN}✅ Directories created${NC}"

echo ""
echo "📝 Step 3: Creating Vite configuration..."

# Create Vite config
cat > frontend/vite.config.js << 'EOF'
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@services': path.resolve(__dirname, './src/services'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@utils': path.resolve(__dirname, './src/utils'),
    },
  },
});
EOF

echo -e "${GREEN}✅ Vite config created${NC}"

echo ""
echo "📝 Step 4: Creating HTML entry point..."

# Create index.html
cat > frontend/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Abcotronics ERP - Fuel Management Services</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
EOF

echo -e "${GREEN}✅ HTML template created${NC}"

echo ""
echo "📝 Step 5: Creating React entry point..."

# Create main.jsx
cat > frontend/src/main.jsx << 'EOF'
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/main.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
EOF

echo -e "${GREEN}✅ Entry point created${NC}"

echo ""
echo "📝 Step 6: Creating main App component..."

# Create App.jsx
cat > frontend/src/App.jsx << 'EOF'
import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// Placeholder components - replace with your actual components
function Dashboard() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
      <p className="mt-4 text-gray-600">
        Welcome to the modernized Abcotronics ERP!
      </p>
      <div className="mt-8 p-6 bg-green-50 border border-green-200 rounded-lg">
        <h2 className="text-xl font-semibold text-green-900">🎉 Migration Successful!</h2>
        <ul className="mt-4 space-y-2 text-green-800">
          <li>✅ Vite dev server running</li>
          <li>✅ Hot Module Replacement active</li>
          <li>✅ Modern React architecture</li>
          <li>✅ Proper ES modules</li>
        </ul>
        <p className="mt-4 text-sm text-green-700">
          Next: Copy your components from src/ to frontend/src/components/
        </p>
      </div>
    </div>
  );
}

function Login() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-96">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Login</h1>
        <p className="text-gray-600">Login component - to be implemented</p>
      </div>
    </div>
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  useEffect(() => {
    // Check authentication status
    const token = localStorage.getItem('abcotronics_token');
    setIsAuthenticated(!!token);
  }, []);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route 
        path="/" 
        element={isAuthenticated ? <Dashboard /> : <Navigate to="/login" />} 
      />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default App;
EOF

echo -e "${GREEN}✅ App component created${NC}"

echo ""
echo "📝 Step 7: Creating basic styles..."

# Copy or create styles
if [ -f "src/styles/main.css" ]; then
    cp src/styles/main.css frontend/src/styles/
    echo -e "${GREEN}✅ Copied existing styles${NC}"
else
    mkdir -p frontend/src/styles
    cat > frontend/src/styles/main.css << 'EOF'
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Add your custom styles here */
body {
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

#root {
  min-height: 100vh;
}
EOF
    echo -e "${GREEN}✅ Created basic styles${NC}"
fi

echo ""
echo "📝 Step 8: Updating package.json scripts..."

# Backup original package.json
cp package.json package.json.backup

# Create new scripts
node << 'NODESCRIPT'
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

pkg.scripts = {
  ...pkg.scripts,
  "dev": "concurrently \"npm run dev:frontend\" \"npm run dev:backend\"",
  "dev:frontend": "cd frontend && vite",
  "dev:backend": "node server.js",
  "build:new": "cd frontend && vite build",
  "preview": "cd frontend && vite preview",
  // Keep old scripts prefixed with "old:"
  "old:build": pkg.scripts.build || "npm run build:jsx && npm run build:css",
  "old:start": pkg.scripts.start || "node server.js"
};

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
console.log('✅ Package.json updated');
NODESCRIPT

echo -e "${GREEN}✅ Scripts updated (backup saved as package.json.backup)${NC}"

echo ""
echo "📝 Step 9: Moving backend files..."

# Move server files to backend directory if not already there
if [ -f "server.js" ] && [ ! -f "backend/server.js" ]; then
    cp server.js backend/
    echo -e "${GREEN}✅ Server files copied to backend/${NC}"
fi

echo ""
echo "📝 Step 10: Creating migration guide..."

cat > MIGRATION-NEXT-STEPS.md << 'EOF'
# Migration Next Steps

## ✅ What's Been Set Up

1. **Frontend Structure** - New `frontend/` directory with Vite
2. **Modern Dependencies** - React 18, Vite, React Router
3. **Dev Scripts** - `npm run dev` for concurrent frontend + backend
4. **Build Configuration** - Vite config with API proxy
5. **Basic App** - Starter App.jsx with routing

## 📋 Next Steps (In Order)

### 1. Test the New Setup (5 minutes)

Start the development servers:
```bash
npm run dev
```

Visit: http://localhost:3000

You should see:
- ✅ Vite dev server running
- ✅ Green success message
- ✅ Hot reload working (edit App.jsx and save)

### 2. Migrate Components (1-2 hours per module)

**Priority order:**
1. Auth components (Login, AuthContext)
2. Layout components (MainLayout, Sidebar, Header)
3. Core business components (Projects, Clients)
4. Supporting components (Modals, Forms)

**For each component:**

**BEFORE (old style):**
```javascript
(() => {
  const { useState } = React;
  const Component = () => { ... };
  window.Component = Component;
})();
```

**AFTER (modern style):**
```javascript
import React, { useState } from 'react';
export function Component() { ... }
```

**Migration checklist per component:**
- [ ] Replace `React.useState` with `import { useState }`
- [ ] Remove IIFE wrapper `(() => { ... })()`
- [ ] Remove `window.Component = Component`
- [ ] Add `export function Component`
- [ ] Replace `window.storage` with `import { storage }`
- [ ] Replace `window.DatabaseAPI` with `import { DatabaseAPI }`
- [ ] Test in browser with hot reload

### 3. Create Service Files

Move these to `frontend/src/services/`:

**DatabaseAPI.js:**
```javascript
export class DatabaseAPI {
  static async getProjects() { ... }
  static async updateProject(id, data) { ... }
  // ... your existing methods
}
```

**storage.js:**
```javascript
export const storage = {
  getToken() { ... },
  setToken() { ... },
  // ... your existing methods
};
```

### 4. Update Backend Server

Modify `backend/server.js` to serve Vite build:

```javascript
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
}
```

### 5. Test Each Module

As you migrate each module:
- [ ] Component renders correctly
- [ ] API calls work
- [ ] Navigation works
- [ ] Modals open/close properly (no more refresh bug!)
- [ ] Forms save data
- [ ] Authentication persists

### 6. Production Build

When ready:
```bash
npm run build:new
```

Outputs optimized files to `dist/`

### 7. Deploy

**Railway:**
```bash
git add .
git commit -m "Migrated to modern React architecture"
git push
```

Update Railway build command: `npm run build:new`

## 🎯 Migration Strategy

### Option A: Weekend Migration (Recommended)
- Friday evening: Test new setup
- Saturday: Migrate core modules (Auth, Layout, Projects)
- Sunday: Migrate remaining modules + testing
- Monday: Deploy

### Option B: Gradual Migration
- Week 1: Set up + migrate Auth
- Week 2: Migrate Projects + Clients
- Week 3: Migrate Manufacturing + HR
- Week 4: Final testing + deploy

## 🐛 Common Issues

### Issue: "Module not found"
**Fix:** Check import paths use `@/` or relative paths

### Issue: "React is not defined"
**Fix:** Add `import React from 'react'` at top of file

### Issue: "Cannot read property of undefined"
**Fix:** Ensure services are properly imported and initialized

### Issue: Hot reload not working
**Fix:** Check file is inside `frontend/src/`

## 📚 Resources

- Vite Docs: https://vitejs.dev
- React Router: https://reactrouter.com
- Migration examples: See `frontend/src/App.jsx`

## 🆘 Need Help?

If stuck, keep the old system running (`npm run old:build`) while debugging the new one.

Your old files are untouched - new system is in `frontend/`
EOF

echo -e "${GREEN}✅ Migration guide created${NC}"

echo ""
echo "============================================================"
echo -e "${GREEN}🎉 MIGRATION SETUP COMPLETE!${NC}"
echo "============================================================"
echo ""
echo "📚 What was created:"
echo "   • frontend/          - New Vite React app"
echo "   • frontend/vite.config.js"
echo "   • frontend/src/main.jsx"
echo "   • frontend/src/App.jsx"
echo "   • MIGRATION-NEXT-STEPS.md - Your step-by-step guide"
echo ""
echo "🚀 Next steps:"
echo ""
echo "   1. Start development servers:"
echo "      ${YELLOW}npm run dev${NC}"
echo ""
echo "   2. Visit: ${YELLOW}http://localhost:3000${NC}"
echo ""
echo "   3. Read: ${YELLOW}MIGRATION-NEXT-STEPS.md${NC}"
echo ""
echo "   4. Start migrating components from ${YELLOW}src/${NC} to ${YELLOW}frontend/src/components/${NC}"
echo ""
echo "⚠️  Your old files are untouched - new system is in frontend/"
echo ""
echo "📖 Full documentation: ${YELLOW}MODERNIZE-ARCHITECTURE.md${NC}"
echo ""

# Create a quick start script
cat > start-dev.sh << 'EOF'
#!/bin/bash
echo "🚀 Starting Abcotronics ERP (Modern Stack)"
echo "Frontend: http://localhost:3000"
echo "Backend:  http://localhost:5000"
echo ""
npm run dev
EOF

chmod +x start-dev.sh

echo "💡 Tip: Run ${YELLOW}./start-dev.sh${NC} to start both servers"
echo ""
