# Monthly Document Tracker Year-Based Editing Test Guide

## Overview
This guide helps you test the new year-based editing functionality in the Monthly Document Tracker.

## What Was Changed
- Each year now has independent data storage
- Status and comments are year-specific
- Switching years preserves all data
- Changes in one year don't affect other years

## Manual Testing Steps

### 1. Access the Tracker
1. Log in to https://abcoafrica.co.za
2. Navigate to **Projects**
3. Open a project that has the Monthly Document Tracker
4. Click on **Monthly Document Collection Tracker**

### 2. Test Year Switching
1. **Locate the Year dropdown** (usually at the top of the tracker)
2. **Note the current year** and any existing data
3. **Switch to a different year** (e.g., if viewing 2025, switch to 2024)
4. **Verify**:
   - The tracker shows data for the selected year
   - Status values are different (or empty if no data exists for that year)
   - Comments are year-specific

### 3. Test Data Independence
1. **Select Year 2025** (or current year)
2. **Update a status** for any document/month combination
3. **Add a comment** to any document/month
4. **Switch to Year 2024**
5. **Verify**:
   - The status you just updated is NOT visible (it's in 2025)
   - The comment you added is NOT visible (it's in 2025)
6. **Switch back to Year 2025**
7. **Verify**:
   - Your status update is still there
   - Your comment is still there

### 4. Test Data Persistence
1. **Make changes in Year 2025**:
   - Update multiple statuses
   - Add multiple comments
2. **Switch to Year 2024**
3. **Make different changes in Year 2024**
4. **Switch back to Year 2025**
5. **Verify**:
   - All your 2025 changes are preserved
   - The 2024 changes don't appear in 2025

### 5. Test Template Application
1. **Select Year 2025**
2. **Apply a template** (if available)
3. **Switch to Year 2024**
4. **Verify**:
   - The template data appears only in 2025
   - Year 2024 is unaffected

## Automated Browser Console Test

### Quick Test Script
1. Open the Monthly Document Tracker in your browser
2. Open the browser console (F12 or Cmd+Option+I)
3. Copy and paste the contents of `tests/test-monthly-document-tracker-years.js`
4. Press Enter
5. Review the test results

### What the Test Checks
- ✅ Component loads correctly
- ✅ Year selector is present and functional
- ✅ Multiple years are available
- ✅ Year switching works
- ✅ Data structure is correct
- ✅ Sections are displayed
- ✅ Month columns are shown
- ✅ Year preference is stored in localStorage

## Expected Behavior

### ✅ Correct Behavior
- Each year shows only its own data
- Switching years is instant and smooth
- No data loss when switching years
- Changes in one year don't affect others
- All years are preserved when saving

### ❌ Issues to Report
- Data from one year appearing in another
- Data loss when switching years
- Changes in one year affecting another
- Year selector not working
- Errors in browser console

## Troubleshooting

### Year Selector Not Visible
- Hard refresh the page (Cmd+Shift+R / Ctrl+Shift+R)
- Check if you're on a project page with the tracker
- Verify the tracker component loaded completely

### Data Not Persisting
- Wait a few seconds after making changes (auto-save runs after 1 second)
- Check browser console for errors
- Verify you're logged in and have permissions

### Changes Not Showing
- Hard refresh the page
- Clear browser cache if needed
- Check network tab for failed API calls

## Reporting Issues

If you find any issues, please report:
1. **What you were doing** (e.g., "Switching from 2025 to 2024")
2. **What you expected** (e.g., "2024 data to show")
3. **What actually happened** (e.g., "2025 data still showing")
4. **Browser console errors** (if any)
5. **Screenshots** (if helpful)

## Technical Details

### Data Structure
- Data is stored as: `{ [year]: sections[] }`
- Each year has its own sections array
- Status and comments use month-year keys: `"January-2025"`
- All years are merged when saving to database

### Storage
- Year preference: `localStorage.documentCollectionSelectedYear_{projectId}`
- Main data: Database `project.documentSections` field
- Data format: JSON array of sections with year-specific status/comments

