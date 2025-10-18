# 🚀 Deployment Fixes for Vercel

## Critical Auth Import Path Fixes

The following files need to be updated in your GitHub repository to fix the Vercel deployment errors:

### 1. `api/auth/refresh.js`
**Change line 1:**
```javascript
// FROM:
import { prisma } from './_lib/prisma.js'

// TO:
import { prisma } from '../_lib/prisma.js'
```

**Change lines 2-5:**
```javascript
// FROM:
import { badRequest, ok, serverError, unauthorized } from './_lib/response.js'
import { signAccessToken, signRefreshToken, verifyRefreshToken } from './_lib/jwt.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

// TO:
import { badRequest, ok, serverError, unauthorized } from '../_lib/response.js'
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../_lib/jwt.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
```

### 2. `api/auth/logout.js`
**Change lines 1-3:**
```javascript
// FROM:
import { badRequest, ok, serverError } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

// TO:
import { badRequest, ok, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
```

## 🎯 Quick Fix Instructions

1. **Go to your GitHub repository**: https://github.com/gemauck/Abco-ERP-2
2. **Navigate to each file** listed above
3. **Click "Edit"** (pencil icon)
4. **Make the changes** as shown above
5. **Commit the changes** with message: "Fix auth import paths"
6. **Vercel will automatically redeploy**

## ✅ What This Fixes

- ❌ **Before**: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/var/task/api/auth/_lib/prisma.js'`
- ✅ **After**: Authentication endpoints will work correctly

## 📋 Additional Changes Included

This deployment also includes the complete removal of probability fields from:
- Opportunity forms and displays
- Lead forms and displays  
- Pipeline statistics and filtering
- All probability-based calculations

The system now focuses on deal values and stages without probability weighting.
