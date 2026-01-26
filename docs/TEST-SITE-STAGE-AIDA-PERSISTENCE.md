# Test: Site Stage & AIDA Status persistence (Leads)

## Prerequisites

1. **DB columns**  
   Ensure `ClientSite` has `stage` and `aidaStatus`:
   ```bash
   psql "$DATABASE_URL" -f ensure-client-site-stage-aida.sql
   ```

2. **Backend running**  
   ```bash
   npm run dev:backend
   ```

3. **Log in** to the app** and open **CRM → Leads**.

---

## Test steps

1. **Open a lead** (or create one) that has at least one site.
2. Go to the **Sites** tab.
3. **Edit a site** (pencil icon): change **Stage** (e.g. to "On Hold") and **AIDA Status** (e.g. to "Interest").
4. Click **Update Site**.
5. **Check persistence (same session)**  
   - Stage and AIDA on the site card should stay as set.  
   - In the browser console you should see something like:  
     `💾 [handleSaveLead] Sending lead data: { ..., sitesStageAida: [{ id, name, stage: "On Hold", aidaStatus: "Interest" }] }`
6. **Check persistence (navigation)**  
   - Switch to **Overview** then back to **Sites**: Stage and AIDA should still match what you set.
7. **Check persistence (reopen)**  
   - Close the lead modal and open the same lead again → go to **Sites**: Stage and AIDA should still be correct.

---

## If it still doesn’t persist

- Confirm the console log in step 5 shows `stage` and `aidaStatus` in `sitesStageAida`.
- If they’re missing, the problem is in the modal (payload building).
- If they’re present but the UI or reloaded data is wrong, the problem is in the API or in how the lead/sites are merged after save.
