# Inventory Bulk Upload - Quick Start

## Files Created

1. **`inventory-bulk-upload-template.csv`** - CSV template with example rows
2. **`convert-csv-to-json.js`** - Script to convert CSV to JSON format
3. **`INVENTORY-BULK-UPLOAD-GUIDE.md`** - Detailed documentation

## Quick Steps

### 1. Prepare Your Data
- Open `inventory-bulk-upload-template.csv` in Excel/Google Sheets
- Delete the example rows (keep header)
- Fill in your inventory data
- Save as CSV

### 2. Convert to JSON
```bash
node convert-csv-to-json.js inventory-bulk-upload-template.csv output.json
```

### 3. Upload via API
```bash
curl -X POST https://your-api-url/api/manufacturing/inventory \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d @output.json
```

Or use the JSON in your application's API call.

## Required Fields

- **Name** (required) - Item name/description

## Optional Fields

- SKU (auto-generated if not provided)
- Category, Type, Quantity, Unit, Costs, etc.
- See `INVENTORY-BULK-UPLOAD-GUIDE.md` for complete field list

## Notes

- SKU will be auto-generated if left empty (format: SKU0001, SKU0002, etc.)
- Location Code defaults to LOC001 (Main Warehouse) if not provided
- Supplier Part Numbers should be JSON array format: `["PART1", "PART2"]`
- Total Value can be calculated from Quantity × Unit Cost if not provided

For detailed information, see `INVENTORY-BULK-UPLOAD-GUIDE.md`.

