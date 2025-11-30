# Manufacturing Module - Comprehensive Test Plan

## ✅ Already Tested
- [x] Stock ledger balance calculations (mathematical integrity)
- [x] Movement sorting (chronological order)
- [x] Code review for best practices

## 🔍 Remaining Test Scenarios

### 1. Inventory Item Creation
- [ ] Create new inventory item with starting quantity
  - Verify: Initial balance stock movement is created
  - Verify: LocationInventory is updated
  - Verify: Master InventoryItem quantity matches
  - Verify: Stock ledger shows correct initial balance

### 2. Stock Movement Types

#### Receipt (Incoming Stock)
- [ ] Create receipt transaction
  - Verify: Stock increases in LocationInventory
  - Verify: Master InventoryItem quantity increases
  - Verify: Stock movement is recorded
  - Verify: Stock ledger balance is correct
  - Verify: Total value is recalculated

#### Consumption (Outgoing Stock)
- [ ] Create consumption transaction
  - Verify: Stock decreases in LocationInventory
  - Verify: Master InventoryItem quantity decreases
  - Verify: Stock movement is recorded
  - Verify: Stock ledger balance is correct
  - Verify: Cannot consume more than available (if validation exists)

#### Adjustment (Positive)
- [ ] Create positive adjustment (+10)
  - Verify: Stock increases
  - Verify: Stock movement recorded with positive quantity
  - Verify: Balance calculation is correct

#### Adjustment (Negative)
- [ ] Create negative adjustment (-5)
  - Verify: Stock decreases
  - Verify: Stock movement recorded with negative quantity
  - Verify: Balance calculation is correct
  - Verify: Can go negative (if allowed)

#### Transfer (Between Locations)
- [ ] Create transfer from Location A to Location B
  - Verify: Source location quantity decreases
  - Verify: Destination location quantity increases
  - Verify: Master InventoryItem quantity unchanged
  - Verify: Stock movements created for both locations
  - Verify: Cannot transfer more than available at source

### 3. Production Orders

#### Create Production Order
- [ ] Create production order with BOM
  - Verify: Stock is allocated (if status is 'requested')
  - Verify: Allocated quantity is updated
  - Verify: Available quantity decreases

#### Complete Production Order
- [ ] Complete a production order
  - Verify: Finished product quantity increases
  - Verify: Component quantities decrease
  - Verify: Stock movements created for finished product (receipt)
  - Verify: Stock movements created for components (consumption)
  - Verify: LocationInventory updated for all items
  - Verify: Master InventoryItem aggregates updated
  - Verify: Allocated quantities released

#### Cancel Production Order
- [ ] Cancel a production order
  - Verify: Allocated stock is released
  - Verify: Stock movements are created (if applicable)

### 4. Sales Orders

#### Create Sales Order
- [ ] Create sales order
  - Verify: Order is created
  - Verify: No stock movement until shipped

#### Ship Sales Order
- [ ] Mark sales order as shipped
  - Verify: Stock decreases for sold items
  - Verify: Stock movements created (type: sale)
  - Verify: LocationInventory updated
  - Verify: Master InventoryItem updated
  - Verify: Cannot ship more than available (if validation exists)

### 5. Purchase Orders

#### Create Purchase Order
- [ ] Create purchase order
  - Verify: Order is created
  - Verify: No stock movement until received

#### Receive Purchase Order
- [ ] Mark purchase order as received
  - Verify: Stock increases for received items
  - Verify: Stock movements created (type: receipt)
  - Verify: LocationInventory updated
  - Verify: Master InventoryItem updated

### 6. Data Integrity Tests

#### LocationInventory vs Master InventoryItem
- [ ] Verify: Sum of LocationInventory quantities = Master InventoryItem quantity
  - Test with single location
  - Test with multiple locations
  - Test after various transactions

#### Stock Movement Audit Trail
- [ ] Verify: All inventory changes have corresponding stock movements
  - Initial balance
  - Receipts
  - Consumptions
  - Adjustments
  - Transfers
  - Production completions
  - Sales shipments

#### Stock Ledger Accuracy
- [ ] Verify: Stock ledger balances match actual quantities
  - Test with multiple transactions
  - Test with different movement types
  - Test with transfers between locations

### 7. Edge Cases

#### Zero Quantity
- [ ] Test: Create item with 0 quantity
- [ ] Test: Adjust to 0 quantity
- [ ] Test: Consume all stock (to 0)

#### Negative Quantity (if allowed)
- [ ] Test: Negative adjustment
- [ ] Test: Display of negative balances
- [ ] Test: Stock ledger with negative balances

#### Multiple Locations
- [ ] Test: Same item at different locations
- [ ] Test: Transfer between locations
- [ ] Test: Master aggregate from multiple locations

#### Concurrent Operations
- [ ] Test: Multiple transactions on same item
- [ ] Test: Production order while sales order exists
- [ ] Test: Race conditions (if possible)

### 8. UI/UX Tests

#### Stock Ledger Display
- [ ] Verify: Movements displayed newest-first
- [ ] Verify: Balances calculated correctly
- [ ] Verify: Closing balance matches current quantity
- [ ] Verify: In/Out columns display correctly
- [ ] Verify: Movement types are formatted correctly

#### Inventory List
- [ ] Verify: Quantities display correctly
- [ ] Verify: Allocated quantities display correctly
- [ ] Verify: Available quantities = Total - Allocated
- [ ] Verify: Status indicators (in_stock, low_stock, out_of_stock)

#### Transaction Forms
- [ ] Verify: All required fields validated
- [ ] Verify: Location selection works
- [ ] Verify: Quantity validation
- [ ] Verify: Error messages are clear

### 9. Performance Tests

#### Large Datasets
- [ ] Test: Stock ledger with 100+ movements
- [ ] Test: Inventory list with 100+ items
- [ ] Test: Production order with many components

#### Transaction Speed
- [ ] Test: Stock movement creation speed
- [ ] Test: Production order completion speed
- [ ] Test: Inventory aggregation speed

## 🎯 Priority Test Scenarios

### High Priority (Critical Functionality)
1. ✅ Stock ledger balance calculations
2. ✅ Movement sorting
3. ⚠️ Create inventory item with initial balance
4. ⚠️ Create receipt transaction
5. ⚠️ Create consumption transaction
6. ⚠️ Complete production order
7. ⚠️ Ship sales order
8. ⚠️ LocationInventory vs Master InventoryItem consistency

### Medium Priority (Important Features)
1. ⚠️ Create adjustment (positive and negative)
2. ⚠️ Create transfer between locations
3. ⚠️ Receive purchase order
4. ⚠️ Cancel production order
5. ⚠️ Stock ledger display accuracy

### Low Priority (Edge Cases)
1. ⚠️ Zero quantity scenarios
2. ⚠️ Negative quantity scenarios
3. ⚠️ Multiple locations for same item
4. ⚠️ Concurrent operations

## 📝 Test Execution

Run tests in this order:
1. Basic CRUD operations (create, read, update inventory items)
2. Stock movements (receipt, consumption, adjustment, transfer)
3. Production orders (create, complete, cancel)
4. Sales orders (create, ship)
5. Purchase orders (create, receive)
6. Data integrity verification
7. Edge cases
8. Performance tests

## ✅ Success Criteria

All tests pass if:
- ✅ All stock movements are recorded correctly
- ✅ LocationInventory matches Master InventoryItem aggregates
- ✅ Stock ledger balances are mathematically correct
- ✅ All transaction types work as expected
- ✅ No data inconsistencies
- ✅ Error handling works correctly
- ✅ UI displays data accurately

