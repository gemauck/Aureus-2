# Inventory Bulk Upload Guide

This guide explains how to use the CSV template to bulk upload inventory items to the ERP system.

## CSV Template File

Use the file `inventory-bulk-upload-template.csv` as a starting point for your bulk uploads.

## Field Descriptions

### Required Fields

- **SKU** (optional): Stock Keeping Unit. If left empty, the system will auto-generate SKUs in the format `SKU0001`, `SKU0002`, etc.
- **Name** (required): The name/description of the inventory item. This is the primary identifier.

### Optional Fields

- **Category**: Item category. Valid values:
  - `components` (default)
  - `accessories`
  - `finished_goods`
  - `raw_materials`
  
- **Type**: Item type. Valid values:
  - `component` (default)
  - `raw_material`
  - `work_in_progress`
  - `finished_good`
  - `final_product`

- **Quantity**: Initial stock quantity (default: 0)

- **Unit**: Unit of measurement (default: `pcs`)
  - Common values: `pcs`, `kg`, `g`, `m`, `cm`, `L`, `mL`, etc.

- **Unit Cost**: Cost per unit (default: 0)

- **Total Value**: Total inventory value. If provided, will be used; otherwise calculated as `Quantity × Unit Cost`

- **Reorder Point**: Minimum stock level before reordering (default: 0)
  - If not provided, system may auto-calculate as 20% of quantity

- **Reorder Qty**: Quantity to order when reorder point is reached (default: 0)
  - If not provided, system may auto-calculate as 30% of quantity

- **Location**: Text description of location (default: empty string)

- **Location Code**: Stock location code (e.g., `LOC001` for Main Warehouse)
  - If not provided, items will be assigned to the main warehouse (LOC001)
  - You can find location codes in the Stock Locations section

- **Supplier**: Supplier name (default: empty string)

- **Thumbnail**: URL or path to item image (default: empty string)

- **Legacy Part Number**: Old part number from previous system (default: empty string)

- **Manufacturing Part Number**: Internal manufacturing part number (default: empty string)

- **Supplier Part Numbers**: JSON array of supplier part numbers (default: `[]`)
  - Format: `["PART1", "PART2", "PART3"]`
  - Example: `["SUP-001", "SUP-002"]`
  - For single part number: `["SUP-001"]`
  - For none: `[]`

## Usage Instructions

### Step 1: Prepare Your Data

1. Open `inventory-bulk-upload-template.csv` in Excel, Google Sheets, or any spreadsheet application
2. Delete the example rows (keep the header row)
3. Fill in your inventory data following the field descriptions above
4. Save as CSV format

### Step 2: Convert CSV to JSON

You'll need to convert your CSV to the JSON format required by the API. You can:

1. **Use the provided script**: Run `node convert-csv-to-json.js inventory-bulk-upload-template.csv` (see below)
2. **Use an online CSV to JSON converter**: Upload your CSV and convert it
3. **Use Excel/Google Sheets**: Export as JSON (may require additional formatting)

### Step 3: Upload via API

The bulk upload is handled through the `/api/manufacturing/inventory` endpoint with an `items` array.

**Request Format:**
```javascript
POST /api/manufacturing/inventory
Content-Type: application/json
Authorization: Bearer <your-token>

{
  "items": [
    {
      "name": "Component Name",
      "sku": "SKU0001",  // optional - will auto-generate if not provided
      "category": "components",
      "type": "component",
      "quantity": 100,
      "unit": "pcs",
      "unitCost": 5.50,
      "totalValue": 550.00,
      "reorderPoint": 20,
      "reorderQty": 30,
      "location": "Main Warehouse",
      "locationCode": "LOC001",  // preferred over locationId
      "supplier": "Supplier ABC",
      "thumbnail": "",
      "legacyPartNumber": "OLD-PART-001",
      "manufacturingPartNumber": "MFG-PART-001",
      "supplierPartNumbers": ["SUP-001", "SUP-002"]  // JSON array
    }
    // ... more items
  ]
}
```

**Note**: The endpoint accepts either:
- `locationCode` (e.g., "LOC001") - recommended
- `locationId` (database ID) - if you have it
- If neither provided, defaults to main warehouse (LOC001)

## Field Mapping Notes

- **SKU**: If you leave this empty, the system will auto-generate sequential SKUs
- **Name**: Can also be provided as `description` or `partNumber` in the JSON
- **Total Value**: If not provided, will be calculated as `quantity × unitCost`
- **Status**: Auto-calculated based on quantity and reorder point:
  - `in_stock`: quantity > reorder point
  - `low_stock`: quantity > 0 and quantity ≤ reorder point
  - `out_of_stock`: quantity = 0
- **Location Code vs Location ID**: 
  - Use `locationCode` (e.g., "LOC001") if you know the code
  - Use `locationId` if you have the database ID
  - If neither provided, defaults to main warehouse

## Tips

1. **Start Small**: Test with a few items first before uploading large batches
2. **Validate Data**: Ensure numeric fields (quantity, costs) are valid numbers
3. **Check Locations**: Verify location codes exist in your system before uploading
4. **Supplier Part Numbers**: Make sure JSON arrays are properly formatted
5. **Backup**: Always backup your data before bulk imports

## Example Row

```
SKU,Name,Category,Type,Quantity,Unit,Unit Cost,Total Value,Reorder Point,Reorder Qty,Location,Supplier,Thumbnail,Legacy Part Number,Manufacturing Part Number,Supplier Part Numbers,Location Code
SKU0001,Resistor 10K Ohm,components,component,500,pcs,0.10,50.00,100,150,Main Warehouse,Electronics Supplier,,RES-10K-001,MFG-RES-001,"[""SUP-RES-001""]",LOC001
```

## Troubleshooting

- **Missing Name**: Items without a name will be skipped with an error
- **Invalid Category/Type**: Invalid values will fall back to defaults
- **Location Not Found**: If location code doesn't exist, item will be assigned to main warehouse
- **Duplicate SKUs**: If SKU already exists, the import may fail or update existing item (depending on implementation)

## Support

For issues or questions about bulk uploads, check the API logs or contact your system administrator.

