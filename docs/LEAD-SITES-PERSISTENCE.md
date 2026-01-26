# Lead sites – DB persistence and browser behaviour

Lead sites are stored in the `ClientSite` table. All add/update/delete operations for lead sites go through the **sites API** so the database is the source of truth and the UI stays in sync.

## API used

- **Add:** `POST /api/sites/client/:clientId` (lead id = clientId)
- **Update:** `PATCH /api/sites/client/:clientId/:siteId`
- **Delete:** `DELETE /api/sites/client/:clientId/:siteId`

The same endpoints are used for client sites; for leads, the lead id is used as `clientId`.

## Where it’s implemented

### 1. ClientDetailModal (CRM lead detail, `entityType="lead"`)

Used when opening a lead from the main CRM (e.g. Leads list → full‑page lead view).

- **Add site:** `window.api.createSite(formData.id, payload)` → writes to DB, then local state + activity log are updated.
- **Update site:** For leads, `window.api.updateSite(formData.id, editingSite.id, payload)` or `DatabaseAPI.makeRequest(...)` is called first so the update is persisted; then `onSave(finalFormData, true)` runs to sync activity and parent state.
- **Delete site:** For leads, `window.api.deleteSite(formData.id, siteId)` or `DatabaseAPI.makeRequest(...)` is called first; on failure, local state is reverted. Then `onSave(finalFormData, true)` runs.

### 2. LeadDetailModal (Pipeline / other flows that use LeadDetailModal)

- **Add site:** `window.api.createSite(leadId, sitePayload)` or `DatabaseAPI.makeRequest(\`/sites/client/${leadId}\`, { method: 'POST', ... })`. Then `onSave(updatedFormData, true)` is awaited so the parent gets the new sites.
- **Update site:** `window.api.updateSite(leadId, siteId, payload)` or `DatabaseAPI.makeRequest(\`/sites/client/${leadId}/${siteId}\`, { method: 'PATCH', ... })` is called first, then `onSave(updatedFormData, true)`.
- **Delete site:** `window.api.deleteSite(leadId, siteId)` or `DatabaseAPI.makeRequest(\`/sites/client/${leadId}/${siteId}\`, { method: 'DELETE' })` is called first; on failure, local form data is restored. Then `onSave(updatedFormData, true)`.

## Payloads

All site payloads use the fields expected by the sites API and `ClientSite`:

- `name`, `address`, `contactPerson`, `contactPhone`, `contactEmail`, `notes`, `siteLead`, `stage`, `aidaStatus`

Form fields `phone` / `email` are mapped to `contactPhone` / `contactEmail` when sending to the API.

## Browser persistence

- **Same session:** Local state and parent state are updated from the modal’s `formData` via `onSave(...)`. The parent (e.g. `handleSaveLead`) keeps `leadFormData.sites` so the lead in state reflects the latest sites.
- **After refresh or reopen:** The lead is loaded with `GET /api/leads/:id`. The handler returns the lead with `clientSites`; `parseClientJsonFields` maps `clientSites` → `sites`. So the open/refresh path always shows what’s in the DB.

## Fallbacks

If `window.api.createSite` / `updateSite` / `deleteSite` are missing, both modals use `window.DatabaseAPI.makeRequest(...)` with the same paths and methods so lead site changes still hit the sites API and persist.
