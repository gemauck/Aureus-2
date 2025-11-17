# Document Collection Template Loading Debug Guide

## Problem
Default templates are not loading in the document collection checklist.

## Quick Test

1. **Open the test file in your browser:**
   ```
   Open: test-document-collection-template-loading.html
   ```

2. **Run the tests in order:**
   - Click "Check Authentication" - Verify you're logged in
   - Click "Test API Endpoint" - Check if API returns templates
   - Click "Check LocalStorage" - See what's cached locally
   - Click "Load Templates (Full Flow)" - Simulate the component's loading process

## Common Issues & Solutions

### Issue 1: No Authentication Token
**Symptoms:** "No authentication token found"
**Solution:** 
- Make sure you're logged in to the application
- Check that `window.storage.getToken()` returns a valid token

### Issue 2: API Returns Empty Array
**Symptoms:** API works but returns 0 templates
**Solution:**
- Run the default template creation script:
  ```bash
  node scripts/create-default-template.js
  ```
- Verify the template exists in the database:
  ```sql
  SELECT * FROM DocumentCollectionTemplate WHERE isDefault = true;
  ```

### Issue 3: Templates Not Parsing Correctly
**Symptoms:** Templates load but sections are empty or malformed
**Solution:**
- Check browser console for JSON parsing errors
- Verify `sections` field in database is valid JSON
- The API should parse sections automatically, but check the response format

### Issue 4: LocalStorage Out of Sync
**Symptoms:** Old/cached templates in localStorage
**Solution:**
- Clear localStorage:
  ```javascript
  localStorage.removeItem('documentCollectionTemplates');
  ```
- Reload the page and let it fetch fresh from API

### Issue 5: Default Template Not Marked as Default
**Symptoms:** Template exists but `isDefault` is false
**Solution:**
- Update the template:
  ```sql
  UPDATE DocumentCollectionTemplate 
  SET isDefault = true 
  WHERE name = 'Document Collection Checklist (Default)';
  ```

## Debugging Steps

1. **Check Browser Console:**
   - Look for errors when loading templates
   - Check network tab for API requests to `/api/document-collection-templates`
   - Verify response status is 200 OK

2. **Check API Response:**
   - Use the test page to see the raw API response
   - Verify response format: `{ templates: [...] }` or `{ data: { templates: [...] } }`
   - Check that `isDefault: true` is present on default templates

3. **Check Component Loading:**
   - Open `MonthlyDocumentCollectionTracker.jsx`
   - Look for console logs starting with `🔄`, `📋`, `✅`, `❌`
   - Verify `loadTemplatesFromAPI` is being called

4. **Check Template Structure:**
   - Default template should have:
     - `isDefault: true`
     - `sections` as an array (not string)
     - Each section should have `name` and `documents` array

## Expected Flow

1. Component mounts → `loadTemplatesFromAPI()` called
2. Load from localStorage (instant UI)
3. Fetch from API (if authenticated)
4. Parse sections from JSON string to array
5. Merge local + API templates (API takes precedence)
6. Save merged templates to localStorage
7. Update component state with templates
8. Display templates in `ApplyTemplateModal`

## Files to Check

- `api/document-collection-templates.js` - API endpoint
- `src/components/projects/MonthlyDocumentCollectionTracker.jsx` - Component that loads templates
- `scripts/create-default-template.js` - Script to create default template
- `prisma/schema.prisma` - Database schema

## Quick Fixes

### Create Default Template
```bash
node scripts/create-default-template.js
```

### Clear Cache and Reload
```javascript
// In browser console:
localStorage.removeItem('documentCollectionTemplates');
location.reload();
```

### Check Database Directly
```sql
-- Check if default template exists
SELECT id, name, isDefault, 
       LENGTH(sections) as sections_length,
       LEFT(sections, 100) as sections_preview
FROM DocumentCollectionTemplate 
WHERE isDefault = true;

-- Check all templates
SELECT id, name, isDefault, createdAt 
FROM DocumentCollectionTemplate 
ORDER BY isDefault DESC, createdAt DESC;
```

