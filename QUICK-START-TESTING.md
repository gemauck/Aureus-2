# Quick Start - Testing BOM Integration

## ⚡ Fast Test (2 minutes)

### Step 1: Start Server
```bash
npm start
```

### Step 2: Open App
1. Go to **Manufacturing** section
2. Click **"Bill of Materials"** tab
3. Click **"Create BOM"** button

### Step 3: What You Should See

✅ **Expected Behavior:**
- Blue info box at top: "Select Finished Product Inventory Item *"
- Dropdown showing finished goods from inventory
- Warning if no item selected
- Product SKU and Name auto-fill when item selected

❌ **If you see:**
- "No finished goods found" → Go to Inventory tab first and create a finished product
- Error about inventoryItemId → Migration needs to apply (will auto-apply on first API call)

### Step 4: Create Test Finished Product (If Needed)

1. Go to **Inventory** tab
2. Click **"Add Item"**
3. Fill in:
   - Name: "Test Finished Product"
   - Type: Select **"finished_good"** (important!)
   - Category: "finished_goods"
   - SKU: Auto-generated
4. Save

### Step 5: Create BOM

1. Go back to **Bill of Materials**
2. Click **"Create BOM"**
3. Select your finished product from dropdown
4. Add components (raw materials)
5. Save

### Step 6: Test Production Order Completion

1. Go to **Production Orders** tab
2. Create new production order using your BOM
3. Set status to **"completed"**
4. Check **Inventory** tab
5. Your finished product should now show:
   - Increased quantity
   - Unit cost = sum of all component costs

## ✅ Success Indicators

- ✅ BOM creation requires inventory item selection
- ✅ Production order completion adds finished goods automatically
- ✅ Finished goods appear in inventory with correct cost
- ✅ No errors in server logs

## 🆘 Troubleshooting

**"No finished goods available"**
→ Create inventory item with `type = finished_good` first

**"Migration needed"**  
→ Normal - will auto-apply on first API call

**Server errors**
→ Check that Prisma client is generated: `npx prisma generate`

---

**Everything should work automatically!** 🎉

