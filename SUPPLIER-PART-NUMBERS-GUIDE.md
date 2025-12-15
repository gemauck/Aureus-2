# Supplier Part Numbers - How It Works

## Overview

The **Supplier Part Numbers** field in the CSV template allows you to store multiple supplier part numbers **with their supplier names** for a single inventory item. This is useful when:
- The same component is available from multiple suppliers
- Different suppliers use different part numbers for the same item
- You need to track which supplier uses which part number

## Format in CSV Template

In the CSV template, Supplier Part Numbers must be formatted as a **JSON array of objects**. Each object contains both the supplier name and part number.

### ✅ Correct Format (Recommended)

#### Multiple Part Numbers with Suppliers:
```csv
"[{""supplier"":""Supplier ABC"",""partNumber"":""SUP-001""},{""supplier"":""Supplier XYZ"",""partNumber"":""SUP-002""}]"
```

#### Single Part Number with Supplier:
```csv
"[{""supplier"":""Supplier ABC"",""partNumber"":""SUP-001""}]"
```

#### No Part Numbers (Empty):
```csv
"[]"
```

### ✅ Legacy Format (Still Supported)

If you use the old format with just part numbers (strings), the system will automatically use the **Supplier** field from the CSV row:

#### Multiple Part Numbers (Legacy):
```csv
"[""SUP-001"",""SUP-002""]"
```
*Note: These will be assigned to the supplier name in the "Supplier" column*

#### Single Part Number (Legacy):
```csv
"[""SUP-001""]"
```
*Note: Will be assigned to the supplier name in the "Supplier" column*

### ❌ Incorrect Formats

```csv
SUP-001,SUP-002          ❌ Wrong - comma-separated
["SUP-001","SUP-002"]    ❌ Wrong - missing outer quotes
SUP-001                  ❌ Wrong - not an array
```

## How It Works

### 1. CSV Format
When you fill out the CSV template, the Supplier Part Numbers column should contain a JSON array string:

**Example row:**
```csv
SKU,Name,Category,Type,Quantity,Unit,Unit Cost,Total Value,Reorder Point,Reorder Qty,Location,Supplier,Thumbnail,Legacy Part Number,Manufacturing Part Number,Supplier Part Numbers,Location Code
,Resistor 10K,components,component,500,pcs,0.10,50.00,100,150,Main Warehouse,Electronics Co,,,,"[""RES-10K-001"",""RES-10K-002""]",LOC001
```

### 2. Parsing Process
When you upload the CSV:
1. The system reads the JSON array string from the CSV
2. Parses it into a JavaScript array: `["RES-10K-001", "RES-10K-002"]`
3. Converts it back to a JSON string for storage: `'["RES-10K-001","RES-10K-002"]'`
4. Stores it in the database as a JSON string

### 3. Database Storage
In the database, `supplierPartNumbers` is stored as a **TEXT field** containing a JSON array string:
- Format: `'["PART1","PART2","PART3"]'`
- Default: `'[]'` (empty array)

## Examples

### Example 1: Multiple Supplier Part Numbers (Recommended Format)
```csv
SKU,Name,Supplier,Supplier Part Numbers
,Capacitor 100uF,Electronics Co,"[{""supplier"":""Electronics Co"",""partNumber"":""CAP-100-001""},{""supplier"":""Alternative Supplier"",""partNumber"":""CAP-100-ALT""}]"
```

**Result:** Item will have 2 supplier part numbers:
- Electronics Co: CAP-100-001
- Alternative Supplier: CAP-100-ALT

### Example 2: Single Supplier Part Number (Recommended Format)
```csv
SKU,Name,Supplier,Supplier Part Numbers
,LED Red 5mm,LED Supplier,"[{""supplier"":""LED Supplier"",""partNumber"":""LED-RED-5MM""}]"
```

**Result:** Item will have 1 supplier part number:
- LED Supplier: LED-RED-5MM

### Example 3: Legacy Format (Auto-assigns Supplier column)
```csv
SKU,Name,Supplier,Supplier Part Numbers
,Resistor 10K,Electronics Co,"[""RES-10K-001"",""RES-10K-002""]"
```

**Result:** Item will have 2 supplier part numbers, both assigned to "Electronics Co":
- Electronics Co: RES-10K-001
- Electronics Co: RES-10K-002

### Example 3: No Supplier Part Numbers
```csv
SKU,Name,Supplier Part Numbers
,Generic Component,"[]"
```

**Result:** Item will have an empty array (no supplier part numbers).

## Tips for Excel/Google Sheets

### In Excel:
1. When entering the JSON array, make sure the entire cell is wrapped in quotes
2. Use double quotes inside: `"[""PART1"",""PART2""]"`
3. Excel may try to format it - make sure it stays as text

### In Google Sheets:
1. Same format as Excel
2. The cell should be formatted as "Plain text" to prevent auto-formatting
3. Format: `"[""PART1"",""PART2""]"`

## Common Issues

### Issue: "Invalid JSON format" error
**Cause:** Missing quotes or incorrect array format
**Solution:** Make sure the format is exactly: `"[""PART1"",""PART2""]"`

### Issue: Part numbers not saving
**Cause:** Array not properly quoted in CSV
**Solution:** Ensure the entire JSON array is wrapped in quotes

### Issue: Excel removes quotes
**Cause:** Excel auto-formats the cell
**Solution:** Format the cell as "Text" before entering data

## Quick Reference

### Recommended Format (with supplier names):

| What You Want | CSV Format |
|--------------|------------|
| No part numbers | `"[]"` |
| One part number from one supplier | `"[{""supplier"":""Supplier Name"",""partNumber"":""PART1""}]"` |
| Two part numbers from same supplier | `"[{""supplier"":""Supplier Name"",""partNumber"":""PART1""},{""supplier"":""Supplier Name"",""partNumber"":""PART2""}]"` |
| Two part numbers from different suppliers | `"[{""supplier"":""Supplier A"",""partNumber"":""PART1""},{""supplier"":""Supplier B"",""partNumber"":""PART2""}]"` |

### Legacy Format (uses Supplier column):

| What You Want | CSV Format |
|--------------|------------|
| No part numbers | `"[]"` |
| One part number | `"[""PART1""]"` (uses Supplier column) |
| Two part numbers | `"[""PART1"",""PART2""]"` (both use Supplier column) |

## Notes

- The double quotes inside the CSV (`""`) are required because CSV uses quotes to escape quotes
- The outer quotes wrap the entire JSON array
- The square brackets `[]` indicate it's a JSON array
- Each part number is a string inside the array

## See Also

- `INVENTORY-BULK-UPLOAD-GUIDE.md` - Complete bulk upload guide
- `HOW-TO-USE-INVENTORY-UPLOAD.md` - Step-by-step usage instructions

