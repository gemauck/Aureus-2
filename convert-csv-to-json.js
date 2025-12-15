#!/usr/bin/env node

/**
 * CSV to JSON Converter for Inventory Bulk Upload
 * 
 * Usage: node convert-csv-to-json.js <input.csv> [output.json]
 * 
 * Converts the inventory bulk upload CSV template to the JSON format
 * required by the /api/manufacturing/inventory endpoint.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseCSV(csvContent) {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV must have at least a header row and one data row');
  }

  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines

    // Simple CSV parsing (handles quoted fields)
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      
      if (char === '"') {
        if (inQuotes && line[j + 1] === '"') {
          // Escaped quote
          current += '"';
          j++;
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim()); // Add last value

    if (values.length !== headers.length) {
      console.warn(`⚠️  Row ${i + 1} has ${values.length} columns, expected ${headers.length}. Skipping.`);
      continue;
    }

    const row = {};
    headers.forEach((header, index) => {
      let value = values[index] || '';
      
      // Parse JSON arrays for Supplier Part Numbers
      if (header === 'Supplier Part Numbers' && value) {
        try {
          // Remove extra quotes if present
          value = value.replace(/^["']|["']$/g, '');
          // Try to parse as JSON
          if (value.startsWith('[') && value.endsWith(']')) {
            value = JSON.parse(value);
          } else if (value) {
            // Single value, wrap in array
            value = [value];
          } else {
            value = [];
          }
        } catch (e) {
          // If parsing fails, treat as single value or empty
          value = value ? [value] : [];
        }
      }
      
      // Convert numeric fields
      if (['Quantity', 'Unit Cost', 'Total Value', 'Reorder Point', 'Reorder Qty'].includes(header)) {
        value = value ? parseFloat(value) : (header === 'Quantity' ? 0 : 0);
      }
      
      // Map CSV headers to API field names
      const fieldMap = {
        'SKU': 'sku',
        'Name': 'name',
        'Category': 'category',
        'Type': 'type',
        'Quantity': 'quantity',
        'Unit': 'unit',
        'Unit Cost': 'unitCost',
        'Total Value': 'totalValue',
        'Reorder Point': 'reorderPoint',
        'Reorder Qty': 'reorderQty',
        'Location': 'location',
        'Supplier': 'supplier',
        'Thumbnail': 'thumbnail',
        'Legacy Part Number': 'legacyPartNumber',
        'Manufacturing Part Number': 'manufacturingPartNumber',
        'Supplier Part Numbers': 'supplierPartNumbers',
        'Location Code': 'locationCode'
      };

      const apiField = fieldMap[header] || header.toLowerCase().replace(/\s+/g, '');
      
      // Only include non-empty values (except for numeric fields which should be 0 if empty)
      if (value !== '' && value !== null && value !== undefined) {
        row[apiField] = value;
      }
    });

    // Only add row if it has at least a name
    if (row.name) {
      rows.push(row);
    } else {
      console.warn(`⚠️  Row ${i + 1} skipped: missing required 'name' field`);
    }
  }

  return rows;
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node convert-csv-to-json.js <input.csv> [output.json]');
    console.error('');
    console.error('Example:');
    console.error('  node convert-csv-to-json.js inventory-bulk-upload-template.csv');
    console.error('  node convert-csv-to-json.js inventory-bulk-upload-template.csv output.json');
    process.exit(1);
  }

  const inputFile = args[0];
  const outputFile = args[1] || inputFile.replace(/\.csv$/i, '.json');

  if (!fs.existsSync(inputFile)) {
    console.error(`❌ Error: File not found: ${inputFile}`);
    process.exit(1);
  }

  try {
    console.log(`📖 Reading CSV file: ${inputFile}`);
    const csvContent = fs.readFileSync(inputFile, 'utf-8');
    
    console.log(`🔄 Converting CSV to JSON...`);
    const items = parseCSV(csvContent);
    
    if (items.length === 0) {
      console.error('❌ Error: No valid items found in CSV');
      process.exit(1);
    }

    const jsonOutput = {
      items: items
    };

    console.log(`💾 Writing JSON to: ${outputFile}`);
    fs.writeFileSync(outputFile, JSON.stringify(jsonOutput, null, 2), 'utf-8');
    
    console.log(`✅ Success! Converted ${items.length} items.`);
    console.log(`📄 Output file: ${path.resolve(outputFile)}`);
    console.log('');
    console.log('Next steps:');
    console.log('1. Review the JSON file to ensure all data is correct');
    console.log('2. Use the JSON in a POST request to /api/manufacturing/inventory');
    console.log('3. The request body should be: { "items": [...] }');
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('convert-csv-to-json.js')) {
  main();
}

export { parseCSV };

