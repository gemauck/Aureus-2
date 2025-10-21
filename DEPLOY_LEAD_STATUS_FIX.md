# 🚀 Quick Deploy Guide - Lead Status Fix

## One-Command Deploy

```bash
cd /Users/gemau/Documents/Project\ ERP/abcotronics-erp-modular
chmod +x deploy-lead-status-fix.sh
./deploy-lead-status-fix.sh
```

That's it! The script will:
1. ✅ Stage your changes
2. ✅ Commit with descriptive message
3. ✅ Push to GitHub
4. ✅ Railway auto-deploys

## Manual Deploy (if script doesn't work)

```bash
cd /Users/gemau/Documents/Project\ ERP/abcotronics-erp-modular

# 1. Stage changes
git add src/components/clients/LeadDetailModal.jsx

# 2. Commit
git commit -m "Fix: Lead Status auto-save on change"

# 3. Push (triggers Railway deploy)
git push origin main
```

## Monitor Deployment

**Railway Dashboard:**
https://railway.app/dashboard

**GitHub Actions:**
https://github.com/gemauck/Abco-ERP-2/actions

## After Deployment (2-5 min)

Test the fix:
1. Open your Railway URL
2. Go to CRM & Sales → Leads
3. Open any lead
4. Change Status dropdown
5. Close modal
6. Reopen same lead
7. ✅ Status should be what you changed it to!

## Your Railway URL

Find it at: https://railway.app/dashboard
(Look for your project → Deployments → Domain)

## Troubleshooting

### Deploy not triggering?
```bash
# Check Railway connection
git remote -v
# Should show: origin https://github.com/gemauck/Abco-ERP-2.git

# Force trigger
echo "$(date +%s)" > deploy-trigger.txt
git add deploy-trigger.txt
git commit -m "Trigger deploy"
git push origin main
```

### Check deployment logs
```bash
# Railway CLI (if installed)
railway logs

# Or check Railway dashboard → your project → Deployments → View logs
```

## What Got Deployed

**File changed:**
- `src/components/clients/LeadDetailModal.jsx`

**Changes:**
- Status dropdown: Auto-save on change
- AIDIA Stage dropdown: Auto-save on change
- Added console logging
- Fixed option values

## Rollback (if needed)

```bash
# Undo last commit but keep changes
git reset --soft HEAD~1

# Or revert the commit
git revert HEAD
git push origin main
```

## Success Criteria

After deployment completes:
- [ ] Railway build succeeds (check dashboard)
- [ ] Can access your app URL
- [ ] Leads page loads
- [ ] Can open lead detail modal
- [ ] Status change auto-saves
- [ ] Console shows "Auto-saving status change..."
- [ ] Changes persist after closing/reopening modal

## Need Help?

Check Railway logs for errors:
1. Go to Railway dashboard
2. Click your project
3. Click "Deployments"
4. Click latest deployment
5. View build and runtime logs

Common issues:
- **Build failed**: Check package.json syntax
- **App crashes**: Check server.js logs
- **404 errors**: Check Procfile/start command
