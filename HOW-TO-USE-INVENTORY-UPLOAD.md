# How to Use Inventory Bulk Upload - Step by Step

## Method 1: Using the Command Line (Recommended)

### Step 1: Get the Template File

The template file is already in your project:
- **File**: `inventory-bulk-upload-template.csv`
- **Location**: Root directory of your project

You can download it from your repository or access it on the server.

### Step 2: Fill Out Your Data

1. **Open the CSV file** in Excel, Google Sheets, or any spreadsheet application
2. **Delete the example rows** (rows 2-4) - keep only the header row
3. **Fill in your inventory data**:

   **Required Fields:**
   - `Name` - Item name/description (REQUIRED)

   **Common Fields to Fill:**
   - `SKU` - Leave empty to auto-generate, or provide your own
   - `Category` - `components`, `accessories`, `finished_goods`, or `raw_materials`
   - `Type` - `component`, `raw_material`, `work_in_progress`, `finished_good`, or `final_product`
   - `Quantity` - Initial stock quantity (number)
   - `Unit` - Unit of measurement (e.g., `pcs`, `kg`, `m`, `L`)
   - `Unit Cost` - Cost per unit (number)
   - `Total Value` - Total inventory value (or leave empty, will calculate from Quantity × Unit Cost)
   - `Reorder Point` - Minimum stock level (number)
   - `Reorder Qty` - Quantity to order when reorder point reached (number)
   - `Location Code` - Stock location code (e.g., `LOC001` for Main Warehouse)
   - `Supplier` - Supplier name (text)

4. **Save as CSV** (keep the same format)

### Step 3: Convert CSV to JSON

Run the conversion script:

```bash
node convert-csv-to-json.js inventory-bulk-upload-template.csv inventory-upload.json
```

This will create a file called `inventory-upload.json` ready for upload.

### Step 4: Upload via API

#### Option A: Using curl (from command line)

```bash
# First, get your authentication token from the browser
# (Check browser DevTools > Application > Cookies > authToken)

curl -X POST https://abcoafrica.co.za/api/manufacturing/inventory \
  -H "Content-Type: application/json" \
  -H "Cookie: authToken=YOUR_TOKEN_HERE" \
  -d @inventory-upload.json
```

#### Option B: Using the Browser Console

1. Open your ERP system in the browser
2. Open Developer Tools (F12 or Cmd+Option+I)
3. Go to the Console tab
4. Paste and run this code:

```javascript
// Read the JSON file (you'll need to upload it first or paste the content)
const jsonData = {
  "items": [
    // Your items here - paste the content from inventory-upload.json
  ]
};

// Make the API call
fetch('/api/manufacturing/inventory', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  credentials: 'include',
  body: JSON.stringify(jsonData)
})
.then(response => response.json())
.then(data => {
  console.log('✅ Upload successful!', data);
  console.log(`Created: ${data.created || data.data?.created || 0} items`);
  if (data.errors > 0) {
    console.warn(`⚠️ Errors: ${data.errors}`);
  }
})
.catch(error => {
  console.error('❌ Upload failed:', error);
});
```

#### Option C: Using Postman or Similar Tool

1. Import the `inventory-upload.json` file
2. Set method to `POST`
3. URL: `https://abcoafrica.co.za/api/manufacturing/inventory`
4. Headers: `Content-Type: application/json`
5. Add authentication cookie or Bearer token
6. Send request

## Method 2: Quick Example

Here's a minimal example with just required fields:

### CSV File (minimal-example.csv):
```csv
Name,Quantity,Unit,Unit Cost,Category,Type
Resistor 10K Ohm,500,pcs,0.10,components,component
Capacitor 100uF,300,pcs,0.25,components,component
LED Red 5mm,1000,pcs,0.05,components,component
```

### Convert and Upload:
```bash
# Convert
node convert-csv-to-json.js minimal-example.csv output.json

# Upload (using curl with your auth token)
curl -X POST https://abcoafrica.co.za/api/manufacturing/inventory \
  -H "Content-Type: application/json" \
  -H "Cookie: authToken=YOUR_TOKEN" \
  -d @output.json
```

## Field Reference

### Required
- **Name** - Item name (text)

### Optional but Recommended
- **Quantity** - Stock quantity (number, default: 0)
- **Unit** - Unit of measure (text, default: "pcs")
- **Unit Cost** - Cost per unit (number, default: 0)
- **Category** - Item category (text, default: "components")
- **Type** - Item type (text, default: "component")

### Optional
- **SKU** - Auto-generated if empty
- **Total Value** - Calculated if not provided (Quantity × Unit Cost)
- **Reorder Point** - Auto-calculated if not provided (20% of quantity)
- **Reorder Qty** - Auto-calculated if not provided (30% of quantity)
- **Location Code** - Defaults to LOC001 (Main Warehouse)
- **Supplier** - Supplier name
- **Legacy Part Number** - Old part number
- **Manufacturing Part Number** - Internal part number
- **Supplier Part Numbers** - JSON array: `["PART1", "PART2"]`

## Valid Values

### Category
- `components` (default)
- `accessories`
- `finished_goods`
- `raw_materials`

### Type
- `component` (default)
- `raw_material`
- `work_in_progress`
- `finished_good`
- `final_product`

### Unit (examples)
- `pcs` (pieces)
- `kg` (kilograms)
- `g` (grams)
- `m` (meters)
- `cm` (centimeters)
- `L` (liters)
- `mL` (milliliters)

## Troubleshooting

### "Name required" error
- Make sure every row has a value in the `Name` column

### "Invalid category/type" error
- Check that category and type values match the valid options above
- Use lowercase with underscores (e.g., `finished_goods` not `Finished Goods`)

### "Location not found" error
- Check that Location Code exists in your system
- Use `LOC001` for Main Warehouse (default)
- Check Stock Locations section in your ERP to find valid codes

### CSV parsing errors
- Make sure Supplier Part Numbers column uses JSON array format: `["PART1", "PART2"]`
- For empty arrays, use: `[]`
- Make sure numbers don't have currency symbols (use `5.50` not `$5.50`)

### Authentication errors
- Make sure you're logged into the ERP system
- Check that your auth token/cookie is valid
- Try logging out and back in

## Example: Complete Row

```csv
SKU,Name,Category,Type,Quantity,Unit,Unit Cost,Total Value,Reorder Point,Reorder Qty,Location,Supplier,Thumbnail,Legacy Part Number,Manufacturing Part Number,Supplier Part Numbers,Location Code
,Resistor 10K Ohm 1/4W,components,component,500,pcs,0.10,50.00,100,150,Main Warehouse,Electronics Supplier,,RES-10K-001,MFG-RES-001,"[""SUP-RES-001""]",LOC001
```

**Notes:**
- SKU left empty = will auto-generate
- Supplier Part Numbers in JSON array format
- All numeric fields are plain numbers (no currency symbols)
- Location Code matches existing location

## Need Help?

- Check `INVENTORY-BULK-UPLOAD-GUIDE.md` for detailed field descriptions
- Check `INVENTORY-UPLOAD-QUICK-START.md` for quick reference
- Review the example rows in `inventory-bulk-upload-template.csv`

