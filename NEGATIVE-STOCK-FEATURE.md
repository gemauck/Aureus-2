# Negative Stock Feature

## Summary

Manufacturing now allows negative stock with warnings when there isn't enough inventory to fulfill a production order.

## Changes Made

### API Changes (`api/manufacturing.js`)

1. **Removed Stock Validation Blocking**: 
   - Previously threw errors when `totalQty < requiredQty`
   - Now logs warnings and continues with the transaction

2. **Pre-check Stock Before Transaction**:
   - Checks stock availability before starting the transaction
   - Builds array of stock warnings for items that will go negative
   - Returns warnings in the API response

3. **Always Allow Deduction**:
   - Removed `quantity: { gte: requiredQty }` from where clause
   - Removed `allocatedQuantity` validation constraints
   - Stock can now go negative without blocking the order

4. **Negative Stock Handling**:
   - Sets `totalValue` to 0 instead of negative (prevents negative values)
   - Status calculation based on actual quantity, not available quantity
   - Logs warnings when stock goes negative

### Frontend Changes (`src/components/manufacturing/Manufacturing.jsx`)

1. **Visual Indicators**:
   - Negative quantities display in red (`text-red-600`)
   - Available stock shows red when negative
   - Total quantity shows red when negative

2. **Warning Alerts**:
   - Shows alert after successful order update if stock went negative
   - Displays which items are in negative stock
   - Shows available quantity, required quantity, and shortfall

## User Experience

### Before
- **Error**: Order update blocked when insufficient stock
- **Message**: "Insufficient stock for Raisens. Available: 28, Required: 100"
- **Result**: User must cancel order or wait for stock

### After
- **Warning**: Order updates successfully with negative stock
- **Message**: "⚠️ Work order updated successfully! Some items are now in negative stock: Raisens: Available 28, Required 100 (Shortfall: 72)"
- **Visual**: Inventory displays -72 in red
- **Result**: Production can proceed, user aware of shortage

## Use Cases

1. **Backordering**: Accept orders for items not yet in stock
2. **Emergency Production**: Start production before all materials arrive
3. **Forecasting**: Track shortfalls to plan purchases
4. **Manual Adjustments**: Allow users to override stock checks

## Database Impact

- `InventoryItem.quantity` can now be negative
- `InventoryItem.totalValue` is capped at 0 (never negative)
- Stock movement records still created for all deductions
- Historical tracking preserved

## Testing

To test this feature:

1. Create a production order with quantity > available stock
2. Update order status from "requested" to "in_production"
3. Verify you see warning alert
4. Check inventory shows negative quantities in red
5. Verify stock movements recorded correctly

## Files Modified

- `api/manufacturing.js` - Stock deduction logic
- `src/components/manufacturing/Manufacturing.jsx` - UI display and warnings

