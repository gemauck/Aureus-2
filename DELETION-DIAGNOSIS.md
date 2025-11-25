# Monthly Document Collection Tracker - Deletion Issue Diagnosis

## Problem Summary
Attempted to delete items from the Monthly Document Collection Tracker for "Thungela Isibonelo" project, year 2018, but browser automation tools were failing/timing out.

## Root Causes Identified

### 1. Browser Automation Issues
- Browser tools were timing out on navigation
- Browser snapshot operations were being cancelled
- This prevented reliable interaction with the UI

### 2. Confirmation Dialogs
The deletion handlers require user confirmation:
- `handleDeleteDocument`: Shows `confirm('Delete this document/data item?')`
- `handleDeleteSection`: Shows `confirm('Delete section "X" and all its documents?')`
- These dialogs may interfere with automated deletion

### 3. Data Structure Complexity
The document sections are organized by year in a complex way:
- Sections can have template markers (`_template-2018`) indicating they belong to ONLY that year
- Data is stored in multiple places per document:
  - `collectionStatus` (e.g., `"2018-01": "Collected"`)
  - `comments` (e.g., `"2018-01": [...]`)
  - `cellColors` (e.g., `"2018-01": "#ff0000"`)
- Sections are stored in a flat array but organized by year at display time

## Solution: Direct Database Script

I've created a Node.js script (`delete-2018-documents.js`) that:
1. ✅ Connects directly to the database
2. ✅ Finds the "Thungela Isibonelo Diesel Refunds" project
3. ✅ Parses the `documentSections` JSON
4. ✅ Removes all 2018 data:
   - Sections with `_template-2018` markers (entire section deleted)
   - All `2018-*` keys from `collectionStatus`, `comments`, and `cellColors`
5. ✅ Preserves all other year data
6. ✅ Saves the cleaned data back to the database

## How to Use the Script

```bash
cd /Users/gemau/Documents/Project\ ERP/abcotronics-erp-modular
node delete-2018-documents.js
```

## What the Script Does

1. **Finds the project** by name (case-insensitive search for "Thungela Isibonelo")
2. **Loads documentSections** from the database
3. **Identifies 2018 data**:
   - Template markers: `_template-2018`
   - Month keys: `2018-01`, `2018-02`, ..., `2018-12`
4. **Cleans the data**:
   - Deletes entire sections marked with `_template-2018`
   - Removes all `2018-*` keys from all documents
   - Keeps sections/documents that have data for other years
5. **Saves back** to the database

## Expected Output

The script will show:
- Project found confirmation
- Number of sections processed
- Deletion summary (sections deleted, documents cleaned)
- Success confirmation

## Safety Features

- ✅ **Read-only analysis first** - You can review what will be deleted
- ✅ **Preserves all other years** - Only 2018 data is removed
- ✅ **Database transaction** - All changes are atomic
- ✅ **Backup recommended** - Consider backing up database before running

## Alternative: Manual Deletion via UI

If you prefer to delete manually via the UI:
1. Navigate to the project in the browser
2. Open "Document Collection" tab
3. Select year 2018 from the dropdown
4. Click the trash icon (🗑️) next to each section/document you want to delete
5. Confirm each deletion dialog

## Next Steps

1. **Review the script** to ensure it matches your needs
2. **Optional: Create database backup** before running
3. **Run the script**: `node delete-2018-documents.js`
4. **Verify** the deletion in the UI

## Code Locations

- Deletion handlers: `vite-modules/projects/src/components/MonthlyDocumentCollectionTracker.jsx`
  - Line 1979: `handleDeleteSection`
  - Line 2316: `handleDeleteDocument`
- Database schema: `prisma/schema.prisma`
  - Line 196: `documentSections` field (String/JSON)
- API update endpoint: `api/projects/[id].js`
- Script: `delete-2018-documents.js`


