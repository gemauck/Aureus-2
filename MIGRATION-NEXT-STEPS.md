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
