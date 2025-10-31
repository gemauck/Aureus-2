# Adding Stock Items to Inventory

This guide explains how to add all the stock items from the inventory list to the ERP system.

## Option 1: Browser Console (Recommended - Easiest)

This method is the simplest and doesn't require any setup. Just run it in your browser console while logged into the ERP system.

### Steps:

1. **Log into your ERP system** in your web browser
2. **Open the browser console**:
   - Chrome/Edge: Press `F12` or `Ctrl+Shift+J` (Windows/Linux) or `Cmd+Option+J` (Mac)
   - Firefox: Press `F12` or `Ctrl+Shift+K` (Windows/Linux) or `Cmd+Option+K` (Mac)
   - Safari: Press `Cmd+Option+C` (need to enable Developer menu first)

3. **Copy the entire contents** of `add-stock-items-browser.js`

4. **Paste it into the console** and press Enter

5. **Wait for completion** - The script will show progress in the console and display an alert when done

### What it does:
- Uses your existing login session (automatically gets your auth token)
- Adds all ~350 stock items one by one
- Shows progress in the console
- Displays a summary at the end

---

## Option 2: Node.js Script

Use this method if you prefer running scripts from the command line.

### Prerequisites:
- Node.js installed on your system
- An authentication token from your logged-in session

### Steps:

1. **Get your authentication token**:
   - Log into the ERP system in your browser
   - Open browser console (F12)
   - Run: `localStorage.getItem('token')` or `window.storage?.getToken?.()`
   - Copy the token

2. **Set environment variables**:
   ```bash
   export API_BASE="http://localhost:3000"  # or your server URL
   export AUTH_TOKEN="your-token-here"
   ```

3. **Run the script**:
   ```bash
   node add-stock-items-to-inventory.js
   ```

   Or make it executable and run directly:
   ```bash
   chmod +x add-stock-items-to-inventory.js
   ./add-stock-items-to-inventory.js
   ```

---

## What Gets Added

The script adds approximately **350 stock items** including:

- **Components**: Fuses, LEDs, diodes, transistors, capacitors, resistors, ICs, connectors, etc.
- **Accessories**: Enclosures, boxes, batteries, screws, nuts, washers, cables, etc.
- **Finished Goods**: Completed fuel track units
- **Work in Progress**: Housing components, PCB cards, etc.

### For each item, the script:
- Uses the **description** as the item name
- Uses the **part number** for identification
- Sets **quantity** from "Quantity On Hand"
- Calculates **unit cost** from total value / quantity
- Sets **category** automatically based on item type:
  - `components` - Electronic components
  - `accessories` - Hardware, enclosures, batteries
  - `finished_goods` - Completed products
  - `work_in_progress` - WIP items
- Sets **type** automatically:
  - `raw_material` - Most items
  - `finished_good` - Completed units
  - `work_in_progress` - Housing/card items
- Sets **reorder point** to 20% of current quantity
- Sets **reorder quantity** to 30% of current quantity

### Auto-Generated Fields:
- **SKU**: Automatically generated (SKU0001, SKU0002, etc.)
- **Status**: Auto-calculated based on quantity vs reorder point
  - `in_stock` - Quantity > reorder point
  - `low_stock` - Quantity > 0 but <= reorder point
  - `out_of_stock` - Quantity = 0

---

## Troubleshooting

### Browser Console Method:

**Problem**: "No authentication token found"
- **Solution**: Make sure you're logged into the ERP system first

**Problem**: Items fail to add with 401 error
- **Solution**: Your session may have expired. Refresh the page, log in again, and rerun the script

**Problem**: Some items fail to add
- **Solution**: Check the console for specific error messages. The script will continue with other items and show a summary at the end

### Node.js Method:

**Problem**: "AUTH_TOKEN environment variable is required"
- **Solution**: Export the token: `export AUTH_TOKEN="your-token-here"`

**Problem**: Connection refused or network errors
- **Solution**: Check that `API_BASE` is set to the correct URL (localhost or your server)

**Problem**: Items fail with duplicate SKU errors
- **Solution**: Some items may already exist. The script will skip them and continue

---

## Notes

- The script includes a small delay (50ms) between requests to avoid overwhelming the server
- Items with 0 quantity will still be added (marked as `out_of_stock`)
- If an item already exists (same SKU), the API may return an error - this is expected
- Total processing time: Approximately 15-20 seconds for 350 items

---

## Verifying Success

After running the script:

1. Navigate to **Manufacturing** → **Inventory** in your ERP system
2. You should see all the new items listed
3. Check the total count matches (or is close to) the number of items in the script
4. Verify quantities and values are correct for a few sample items

---

## Need Help?

If you encounter issues:
1. Check the browser console (F12) for error messages
2. Verify you're logged in with appropriate permissions
3. Ensure the Manufacturing/Inventory module is accessible
4. Check network requests in the browser DevTools Network tab

