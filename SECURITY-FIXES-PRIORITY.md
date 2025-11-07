# Security Fixes - Priority Action Items

## 🔴 CRITICAL - Fix Immediately

### 1. SQL Injection Fix
**File:** `api/users/invite.js`

**Current Code (Lines 20-27):**
```javascript
await prisma.$queryRawUnsafe(
  'CREATE TABLE IF NOT EXISTS "Invitation" ("id" TEXT NOT NULL, "email" TEXT NOT NULL, "name" TEXT NOT NULL, "role" TEXT NOT NULL DEFAULT \'' + 'user' + '\'...'
)
```

**Fix:** Use Prisma migrations or parameterized queries. The table should already exist via migrations, so this code can likely be removed or replaced with a migration check.

---

### 2. Remove Hardcoded Secrets
**Files to Clean:**
- `deploy-to-droplet.sh` - Remove lines 61-62
- `deploy-production.sh` - Remove lines 114-115  
- `ecosystem.config.mjs` - Remove line 13

**Action:** Replace with environment variable references only.

---

### 3. Fix Weak Password Generation
**Files:** `api/users/index.js:95`, `api/users.js:157`

**Replace:**
```javascript
const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase()
```

**With:**
```javascript
import crypto from 'crypto'
const tempPassword = crypto.randomBytes(16).toString('base64url').slice(0, 16)
```

---

## 🟠 HIGH PRIORITY - Fix This Week

### 4. Fix XSS Vulnerabilities
**Files with innerHTML:**
- `src/components/users/UserManagement.jsx:296`
- `src/components/daily-notes/DailyNotes.jsx` (multiple)
- `src/utils/whatsapp.js:102`

**Action:** Replace `innerHTML` with safe alternatives or sanitize with DOMPurify.

---

### 5. Add Input Validation
**Create:** `api/_lib/validation.js`

**Example Schema:**
```javascript
import { z } from 'zod'

export const clientSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().optional(),
  revenue: z.number().min(0).optional()
})

export const userInviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255),
  role: z.enum(['admin', 'user', 'viewer', 'guest']).default('user')
})
```

---

### 6. Add Authorization Checks
**Example for client access:**
```javascript
// In api/clients/[id].js
const client = await prisma.client.findUnique({ where: { id } })
if (!client) return notFound(res)

// Check authorization
if (client.ownerId !== req.user.sub && req.user.role !== 'admin') {
  return forbidden(res, 'Access denied')
}
```

---

## 🟡 MEDIUM PRIORITY - Fix This Month

### 7. Update Dependencies
```bash
npm update nodemailer@^7.0.10
npm audit fix
```

### 8. Enhance File Upload Security
- Add file type whitelist
- Implement virus scanning
- Store outside web root

### 9. Add CSRF Protection
- Install `csurf` or similar
- Add CSRF tokens to forms
- Validate on state-changing requests

---

## Quick Wins (Can Do Today)

1. ✅ Remove console.log statements with sensitive data
2. ✅ Sanitize error messages in production
3. ✅ Add stricter rate limiting to login endpoint
4. ✅ Update nodemailer dependency

---

## Testing Checklist

After fixes:
- [ ] Test SQL injection protection
- [ ] Verify no secrets in code
- [ ] Test password generation strength
- [ ] Test XSS protection
- [ ] Verify input validation works
- [ ] Test authorization on all endpoints
- [ ] Run `npm audit` to check dependencies

