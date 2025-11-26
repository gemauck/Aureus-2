# Testing Template Application

## Steps to Test the Exxaro Grootegeluk Template

### 1. Start the Application
Make sure your server is running:
```bash
node server.js
```

### 2. Navigate to a Project
1. Open your browser and go to `http://localhost:3000` (or your server URL)
2. Log in to the application
3. Navigate to **Projects** section
4. Open any project (or create a new one)

### 3. Access Document Collection Tracker
1. In the project detail view, look for the **Document Collection** or **Monthly Document Collection** tab/section
2. Click on it to open the Monthly Document Collection Tracker

### 4. Apply the Template
1. In the Document Collection Tracker, look for the **"Apply Template"** button (purple button with a magic wand icon)
2. Click the **"Apply Template"** button
3. A modal should open showing available templates
4. You should see: **"Exxaro Grootegeluk document collection checklist for 2025"** in the dropdown
5. Select the template from the dropdown
6. Choose the target year (default should be 2025)
7. Click **"Apply Template"**

### 5. Verify the Template Applied
After applying, you should see:
- **7 sections** (File 1 through File 7)
- **53 total documents** across all sections
- All sections should be visible in the tracker

### Expected Sections:
- **File 1**: 9 documents (Mining Right, CIPC Documents, VAT Registration, etc.)
- **File 2**: 4 documents (Contracts)
- **File 3**: 12 documents (Tank configuration, meter readings, invoices, etc.)
- **File 4**: 5 documents (Asset registers, driver list)
- **File 5**: 6 documents (FMS-related documents)
- **File 6**: 11 documents (Monthly reports, production data, contractor info)
- **File 7**: 6 documents (Financial statements, VAT, deviations)

## Troubleshooting

### Template Not Showing in Dropdown
- Check browser console for errors
- Verify the template was created: Check database or run the upload script again
- Make sure you're logged in with proper permissions

### Template Applies But Sections Don't Show
- Check browser console for errors
- Refresh the page
- Check if the year selector matches the target year you selected

### Error: "Template not found"
- This was a bug that has been fixed (template ID parsing issue)
- Make sure you have the latest code with the fix applied
- Try refreshing the page

## Template Details
- **Template ID**: `cmi4yet9q0000101po5mp2t77`
- **Template Name**: Exxaro Grootegeluk document collection checklist for 2025
- **Created**: Just now via script
- **Status**: Active and ready to use




