# Integrating Vite Projects Module with Existing System

## Overview

The Projects module now runs in Vite (modern React) while the rest of your app stays in the old system. Both work together seamlessly.

## Architecture

```
Old System (Browser Babel)          Vite Projects Module
├── MainLayout                      ├── Projects (Vite)
├── Clients (old)                   ├── ProjectDetail (Vite)
├── Manufacturing (old)             └── MonthlyDocumentCollectionTracker (Vite)
├── HR (old)                           ↑
└── ...                                │
    ↓                                  │
    └─────── Bridge Layer ─────────────┘
           (They talk via window.ViteProjects)
```

## Step 1: Convert Components to Vite Style

### Before (Old Style)
```javascript
// src/components/projects/Projects.jsx
(() => {
  const { useState, useEffect } = React;
  const storage = window.storage;
  
  const Projects = ({ onProjectClick }) => {
    const [projects, setProjects] = useState([]);
    // ... component code
  };
  
  window.Projects = Projects;
})();
```

### After (Vite Style)
```javascript
// vite-modules/projects/src/components/Projects.jsx
import React, { useState, useEffect } from 'react';

export default function Projects({ onProjectClick }) {
  const [projects, setProjects] = useState([]);
  
  // Same component code, just cleaner!
}
```

### Automated Conversion

```bash
cd vite-modules/projects

# Convert each component
./convert-component.sh Projects.jsx
./convert-component.sh ProjectDetail.jsx
./convert-component.sh MonthlyDocumentCollectionTracker.jsx
```

**Manual fixes needed after conversion:**
1. Add missing imports (e.g., `import { storage } from '@/services/storage'`)
2. Remove any remaining `window.` references
3. Test each component

## Step 2: Handle Shared Services

### Create Service Files

**vite-modules/projects/src/services/DatabaseAPI.js:**
```javascript
// Import from main app or redefine
export class DatabaseAPI {
  static async getProjects() {
    const token = localStorage.getItem('abcotronics_token');
    const response = await fetch('/api/projects', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return response.json();
  }
  
  static async updateProject(id, data) {
    const token = localStorage.getItem('abcotronics_token');
    const response = await fetch(`/api/projects/${id}`, {
      method: 'PUT',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    return response.json();
  }
  
  // Add other methods as needed
}
```

**vite-modules/projects/src/services/storage.js:**
```javascript
export const storage = {
  getToken() {
    return localStorage.getItem('abcotronics_token');
  },
  
  getUser() {
    const userData = localStorage.getItem('abcotronics_user');
    return userData ? JSON.parse(userData) : null;
  },
  
  getProjects() {
    const data = localStorage.getItem('abcotronics_projects');
    return data ? JSON.parse(data) : [];
  },
  
  setProjects(projects) {
    localStorage.setItem('abcotronics_projects', JSON.stringify(projects));
  },
  
  // Add other methods as needed
};
```

### Update Component Imports

```javascript
// At top of each component
import { DatabaseAPI } from '../services/DatabaseAPI';
import { storage } from '../services/storage';

// Then use normally in component
const projects = await DatabaseAPI.getProjects();
const token = storage.getToken();
```

## Step 3: Development Workflow

### Terminal 1: Old System
```bash
# Your existing Express server
npm run dev
# Runs on http://localhost:5000
```

### Terminal 2: Vite Projects
```bash
# New Vite dev server
npm run dev:vite-projects
# Runs on http://localhost:3001
```

### Testing

**Standalone Vite module:**
- Visit http://localhost:3001
- Test Projects module in isolation
- Fast hot reload for quick iteration

**Integrated with old system:**
- Visit http://localhost:5000 (old system)
- Load Vite module dynamically (see Step 4)

## Step 4: Integration Options

### Option A: Side-by-Side (Recommended for Testing)

Keep both systems running independently:

**In old MainLayout.jsx:**
```javascript
// Add a toggle to switch between old and new Projects
const [useViteProjects, setUseViteProjects] = useState(false);

if (activeTab === 'projects') {
  if (useViteProjects) {
    return (
      <div>
        <button onClick={() => setUseViteProjects(false)}>
          Use Old Projects
        </button>
        <iframe 
          src="http://localhost:3001" 
          style={{ width: '100%', height: '100vh', border: 'none' }}
        />
      </div>
    );
  } else {
    return (
      <div>
        <button onClick={() => setUseViteProjects(true)}>
          Use Vite Projects ✨
        </button>
        <Projects />
      </div>
    );
  }
}
```

### Option B: Replace Completely

**After Vite module is tested and working:**

1. Build Vite module:
```bash
npm run build:vite-projects
```

2. Include in main app:
```html
<!-- In your main index.html -->
<script type="module" src="/dist/vite-projects/projects-module.js"></script>
```

3. Use in MainLayout:
```javascript
// Replace old Projects with Vite version
if (activeTab === 'projects') {
  return <window.ViteProjects />;
}
```

## Step 5: Fix MonthlyDocumentCollectionTracker Bug

**In Vite version, the modal bug is GONE!**

**vite-modules/projects/src/components/MonthlyDocumentCollectionTracker.jsx:**
```javascript
import React, { useState, useEffect } from 'react';
import { DatabaseAPI } from '../services/DatabaseAPI';

export default function MonthlyDocumentCollectionTracker({ project }) {
  const [sections, setSections] = useState([]);
  const [showSectionModal, setShowSectionModal] = useState(false);
  
  // Load sections on mount
  useEffect(() => {
    if (project.documentSections) {
      const parsed = JSON.parse(project.documentSections || '[]');
      setSections(parsed);
    }
  }, [project.id]);
  
  // Pause LiveDataSync when modal opens
  useEffect(() => {
    if (showSectionModal) {
      window.LiveDataSync?.pause();
      console.log('🛑 Paused sync');
    } else {
      window.LiveDataSync?.resume();
      console.log('▶️ Resumed sync');
    }
    return () => window.LiveDataSync?.resume();
  }, [showSectionModal]);
  
  const handleAddSection = () => {
    setShowSectionModal(true);  // Modal opens and STAYS OPEN!
  };
  
  const handleSaveSection = async (sectionData) => {
    const newSection = { id: Date.now(), ...sectionData, documents: [] };
    const updatedSections = [...sections, newSection];
    
    // Update local state first
    setSections(updatedSections);
    
    // Save to database
    await DatabaseAPI.updateProject(project.id, {
      documentSections: JSON.stringify(updatedSections)
    });
    
    // Close modal
    setShowSectionModal(false);
  };
  
  return (
    <div>
      <button onClick={handleAddSection}>
        Add Section
      </button>
      
      {showSectionModal && (
        <SectionModal 
          onSave={handleSaveSection}
          onClose={() => setShowSectionModal(false)}
        />
      )}
      
      {/* Rest of component */}
    </div>
  );
}
```

**Why it works now:**
- ✅ Proper React state management
- ✅ No prop drilling from stale parent
- ✅ Component owns its data
- ✅ useEffect properly manages sync pause/resume
- ✅ No race conditions with window globals

## Step 6: Testing Checklist

### Vite Module (Standalone)
- [ ] Runs on http://localhost:3001
- [ ] Projects list loads
- [ ] Can click project to see details
- [ ] MonthlyDocumentCollectionTracker renders
- [ ] "Add Section" button opens modal
- [ ] Modal stays open (no refresh bug!)
- [ ] Can type in modal form
- [ ] Can save section
- [ ] Section appears in list
- [ ] Hot reload works (edit file, see change instantly)

### Integrated with Old System
- [ ] Toggle between old/new Projects works
- [ ] Auth token passed correctly
- [ ] API calls work
- [ ] Data syncs between old and new
- [ ] No console errors

### Production Build
- [ ] `npm run build:vite-projects` succeeds
- [ ] Output files in `dist/vite-projects/`
- [ ] Can load built module in production
- [ ] Performance is good

## Step 7: Production Deployment

### Build Command
```bash
npm run build:vite-projects
```

### Update server.js
```javascript
// Serve Vite projects module
app.use('/vite-projects', express.static(path.join(__dirname, 'dist/vite-projects')));
```

### Deploy
```bash
git add vite-modules/
git add dist/vite-projects/
git commit -m "Add Vite Projects module"
git push
```

## Rollback Plan

If Vite module has issues:

1. **Use toggle** - Switch back to old Projects in UI
2. **Remove script** - Remove Vite script from index.html
3. **Keep old code** - Old Projects still works fine

No risk! Both systems coexist.

## Benefits You'll See Immediately

### Development
- ⚡ **100x faster hot reload** - Changes appear in <100ms
- 🐛 **Modal bug fixed** - Proper React state management
- 🔍 **Better debugging** - Stack traces make sense
- 💡 **Auto-complete** - IDE knows your imports

### Code Quality
- ✅ **Cleaner code** - No IIFE wrappers
- ✅ **Proper imports** - No window globals
- ✅ **Type safety ready** - Can add TypeScript later
- ✅ **Standard React** - Works like every other React app

## Next Steps After Projects

Once Projects module is working well:

1. **Migrate Clients** - Same process
2. **Migrate Manufacturing** - Same process
3. **Migrate HR** - Same process
4. **Gradually phase out old system**

Each module takes ~2 hours to migrate.

## Need Help?

### Common Issues

**"Module not found" errors:**
- Check import paths
- Make sure service files exist
- Use `@/` alias or relative paths

**"React is not defined":**
- Add `import React from 'react'` at top

**API calls fail:**
- Check proxy config in vite.config.js
- Verify token is being passed
- Check CORS if needed

**Hot reload not working:**
- Make sure file is inside `vite-modules/projects/src/`
- Check console for errors
- Restart Vite dev server

### Getting Unstuck

1. Check browser console for errors
2. Check Vite terminal for build errors
3. Compare with working examples in this guide
4. Test in standalone mode (port 3001) first
5. Then test integrated

## Success Metrics

You'll know it's working when:
- ✅ Can edit component and see change in <1 second
- ✅ Modal opens and stays open
- ✅ Can type in forms without refresh
- ✅ Data saves correctly
- ✅ No race conditions
- ✅ Console has no errors
- ✅ You're smiling because development is fun again 😊

---

**Ready to start?**

```bash
chmod +x setup-vite-projects.sh
./setup-vite-projects.sh
```
