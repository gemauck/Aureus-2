# Editing Guide - Which Files to Edit

## ✅ **EDIT THESE - Real Application Code**

These directories contain the **LIVE APPLICATION** code that runs in production:

### 1. **`src/` Directory** - Main Application Components
```
src/
├── components/          ← Edit React components here
│   ├── projects/       ← Project-related components
│   ├── auth/           ← Login, authentication
│   ├── dashboard/      ← Dashboard components
│   └── ...
├── styles/             ← CSS styles
├── utils/              ← Utility functions
└── App.jsx             ← Main app component
```

**Example:** If you're editing `MonthlyDocumentCollectionTracker.jsx`, it should be at:
```
src/components/projects/MonthlyDocumentCollectionTracker.jsx
```

### 2. **`api/` Directory** - Backend API Endpoints
```
api/
├── auth/               ← Authentication endpoints
├── projects/           ← Project API endpoints
├── clients/            ← Client API endpoints
└── ...
```

### 3. **Root Level Files**
```
├── index.html          ← Main HTML file (served to browser)
├── server.js           ← Express server configuration
├── package.json        ← Dependencies and scripts
└── prisma/             ← Database schema
```

---

## ❌ **DON'T EDIT THESE - Placeholder/Modernization Project**

### **`frontend/` Directory** - Separate Modernization Project
```
frontend/
├── src/
│   └── App.jsx         ← PLACEHOLDER - Not used in production
└── ...
```

**⚠️ WARNING:** The `frontend/` directory is a **separate modernization project** with placeholder code. 
- It's NOT used by the live application
- Editing files here will NOT affect production
- This is for future migration work only

---

## 🔍 **How to Verify You're Editing the Right File**

### Method 1: Check the File Path
✅ **Correct paths:**
- `src/components/projects/MonthlyDocumentCollectionTracker.jsx`
- `api/projects/index.js`
- `src/components/auth/LoginPage.jsx`

❌ **Wrong paths:**
- `frontend/src/App.jsx` (placeholder)
- `frontend/src/components/...` (placeholder)

### Method 2: Check What the Server Uses
The Express server (`server.js`) serves files from:
- Root directory (`rootDir`)
- `src/` directory (components are built from here)
- `dist/` directory (built output)

It does **NOT** serve from `frontend/` directory.

### Method 3: Check the Build Process
When you run `npm run build`, it:
1. Builds JSX from `src/` → `dist/`
2. Builds CSS from `src/styles/` → `dist/styles.css`
3. Does **NOT** use `frontend/` directory

---

## 🚀 **Development Workflow**

### For Local Development (Recommended)
```bash
# Start ONLY the backend server (serves real app)
npm run dev:backend

# OR start everything (backend + JSX watcher)
npm run dev:backend
npm run watch:jsx
```

### For Full Development (Backend + Frontend Modernization)
```bash
# Starts backend + frontend modernization project
npm run dev
```

**Note:** If you're working on the real app, you only need `npm run dev:backend`.

---

## 📝 **Quick Reference**

| What You Want to Edit | Directory to Edit |
|----------------------|-------------------|
| React Components | `src/components/` |
| API Endpoints | `api/` |
| Styles/CSS | `src/styles/` |
| Database Schema | `prisma/schema.prisma` |
| Server Config | `server.js` |
| Main HTML | `index.html` |

---

## ✅ **Verification Checklist**

Before making changes, verify:

- [ ] File path starts with `src/` or `api/` (not `frontend/`)
- [ ] File exists in the project root or `src/` directory
- [ ] When you run `npm run dev:backend`, changes appear in browser
- [ ] File is referenced in `index.html` or loaded by the server

---

## 🎯 **Example: Editing MonthlyDocumentCollectionTracker**

**✅ CORRECT:**
```
File: src/components/projects/MonthlyDocumentCollectionTracker.jsx
```

**❌ WRONG:**
```
File: frontend/src/components/projects/MonthlyDocumentCollectionTracker.jsx
```

The correct file is loaded by:
1. `index.html` → loads `/dist/core-bundle.js`
2. `core-bundle.js` → loads components from `src/`
3. Components are built from `src/` to `dist/` by `build-jsx.js`

---

## 🔧 **If You Accidentally Edit the Wrong File**

If you edited a file in `frontend/`:
1. Copy your changes to the correct file in `src/`
2. Delete or revert changes in `frontend/`
3. Test with `npm run dev:backend`

---

## 📚 **Understanding the Project Structure**

```
abcotronics-erp-modular/
├── src/                    ← ✅ REAL APP - Edit here
│   ├── components/         ← React components
│   ├── styles/            ← CSS files
│   └── ...
├── api/                    ← ✅ REAL APP - Edit here
│   └── ...                ← API endpoints
├── frontend/              ← ❌ PLACEHOLDER - Don't edit
│   └── src/               ← Modernization project (not used)
├── dist/                  ← Built output (auto-generated)
├── index.html             ← ✅ REAL APP - Main HTML
├── server.js              ← ✅ REAL APP - Express server
└── package.json           ← ✅ REAL APP - Dependencies
```

---

## 💡 **Pro Tips**

1. **Always check the file path** - If it's in `frontend/`, you're in the wrong place
2. **Use your IDE's file search** - Search for component names to find the real location
3. **Check imports** - Real components import from `src/`, not `frontend/`
4. **Test immediately** - After editing, refresh `http://localhost:3000` to see changes
5. **Build before deploy** - Run `npm run build` to ensure changes are compiled

---

**Remember:** The real application code is in `src/` and `api/`. The `frontend/` directory is a separate modernization project and is NOT used by the live application.





