# Stock Allocation & Deduction Process Review

## 🔴 CRITICAL ISSUES

### 1. **NO TRANSACTION MANAGEMENT** ⚠️ HIGH PRIORITY
**Issue**: Multiple database operations happen without transactions, leading to:
- **Orphaned allocations**: If order creation fails after stock allocation, allocated stock is never released
- **Inconsistent state**: Partial failures leave database in inconsistent state
- **Data integrity risk**: Stock movements can be created without stock deduction completing

**Location**: 
- `api/manufacturing.js` lines 997-1033 (allocation)
- `api/manufacturing.js` lines 1110-1189 (deduction)

**Current Code**:
```javascript
// Allocate stock (multiple updates)
for (const component of components) {
  await prisma.inventoryItem.update({ ... })  // ❌ No rollback if order creation fails
}
const order = await prisma.productionOrder.create({ ... })  // ❌ If this fails, allocations remain
```

**Fix Required**: Wrap in `prisma.$transaction()`:
```javascript
await prisma.$transaction(async (tx) => {
  // Allocate stock
  for (const component of components) {
    await tx.inventoryItem.update({ ... })
  }
  // Create order (will rollback allocations if this fails)
  const order = await tx.productionOrder.create({ ... })
  return order
})
```

### 2. **RACE CONDITIONS** ⚠️ HIGH PRIORITY
**Issue**: Between checking available stock and updating, concurrent requests can:
- Allocate same stock multiple times
- Lead to negative available quantities

**Location**: Lines 1017-1027

**Example Scenario**:
```
Request A: Check available = 100
Request B: Check available = 100  (before A updates)
Request A: Allocate 80 → available = 20
Request B: Allocate 80 → available = -60 ❌ OVER-ALLOCATED
```

**Fix Required**: Use database-level locking or optimistic concurrency:
```javascript
await tx.inventoryItem.update({
  where: { 
    id: inventoryItem.id,
    quantity: { gte: requiredQty }  // Optimistic lock
  },
  data: { allocatedQuantity: { increment: requiredQty } }
})
```

### 3. **NO IDEMPOTENCY CHECK** ⚠️ MEDIUM PRIORITY
**Issue**: If status change from "requested" to "in_production" is called twice:
- Stock gets deducted twice
- Allocation gets reduced below zero

**Location**: Lines 1110-1189

**Fix Required**: Add idempotency check or use unique constraint:
```javascript
// Check if already processed
if (existingOrder.status === 'in_production') {
  return badRequest(res, 'Order already in production')
}
```

### 4. **SILENT FAILURES ON MISSING INVENTORY** ⚠️ MEDIUM PRIORITY
**Issue**: If component SKU doesn't exist in inventory, it silently skips without:
- Warning the user
- Failing the operation
- Logging an error

**Location**: Lines 1012-1029, 1135-1185

**Current Code**:
```javascript
const inventoryItem = await prisma.inventoryItem.findFirst({ ... })
if (inventoryItem) {  // ❌ Silent skip if not found
  // allocate
}
// ❌ No error if inventoryItem is null
```

**Fix Required**: Fail fast if component SKU not found:
```javascript
if (!inventoryItem) {
  return badRequest(res, `Inventory item not found for SKU: ${component.sku}`)
}
```

### 5. **NO ROLLBACK ON COMPONENT FAILURES** ⚠️ MEDIUM PRIORITY
**Issue**: If one component fails validation, previous allocations/deductions remain committed

**Location**: Lines 1007-1031, 1130-1187

**Example**:
```
Component A: Allocated ✅
Component B: Allocated ✅
Component C: Insufficient stock ❌ → Returns error
// Components A & B remain allocated even though order fails
```

**Fix Required**: Wrap in transaction with proper error handling

### 6. **INCONSISTENT QUANTITY CALCULATION** ⚠️ LOW PRIORITY
**Issue**: Different calculation methods for available quantity:
- Line 1017: `quantity - allocatedQuantity`
- Line 1145: `(inventoryItem.quantity || 0) < requiredQty` (checks total, not available)

**Fix Required**: Consistent formula everywhere

## 🟡 DESIGN ISSUES

### 7. **SEQUENTIAL PROCESSING** 
**Issue**: Components processed sequentially in loop, slow for large BOMs

**Fix**: Process in parallel within transaction:
```javascript
await Promise.all(components.map(async (component) => {
  // Process component
}))
```

### 8. **NO STOCK MOVEMENT ROLLBACK**
**Issue**: If stock deduction succeeds but movement creation fails, stock is deducted but not tracked

**Location**: Lines 1158-1184

**Fix**: Include in same transaction

### 9. **MISSING VALIDATION**
**Issue**: No validation that:
- `requiredQty > 0`
- `component.quantity` is numeric
- `orderQuantity > 0`

### 10. **INSUFFICIENT ERROR MESSAGES**
**Issue**: Error messages don't distinguish between:
- Component not found
- Insufficient allocated stock
- Insufficient total stock

## ✅ RECOMMENDED IMPLEMENTATION

```javascript
// CREATE WORK ORDER WITH ALLOCATION
if (body.bomId && orderStatus === 'requested') {
  const order = await prisma.$transaction(async (tx) => {
    // 1. Fetch BOM and validate
    const bom = await tx.bOM.findUnique({ where: { id: body.bomId } })
    if (!bom) throw new Error('BOM not found')
    
    const components = parseJson(bom.components, [])
    if (components.length === 0) throw new Error('BOM has no components')
    
    // 2. Validate all components before allocating
    const componentChecks = await Promise.all(
      components.map(async (component) => {
        if (!component.sku || !component.quantity) return null
        
        const inventoryItem = await tx.inventoryItem.findFirst({
          where: { sku: component.sku }
        })
        if (!inventoryItem) {
          throw new Error(`Inventory item not found for SKU: ${component.sku}`)
        }
        
        const requiredQty = parseFloat(component.quantity) * orderQuantity
        if (requiredQty <= 0) {
          throw new Error(`Invalid quantity for ${component.sku}`)
        }
        
        const availableQty = inventoryItem.quantity - (inventoryItem.allocatedQuantity || 0)
        if (availableQty < requiredQty) {
          throw new Error(`Insufficient stock for ${component.name || component.sku}. Available: ${availableQty}, Required: ${requiredQty}`)
        }
        
        return { inventoryItem, requiredQty, component }
      })
    )
    
    // 3. Allocate all components atomically
    await Promise.all(
      componentChecks
        .filter(Boolean)
        .map(({ inventoryItem, requiredQty }) =>
          tx.inventoryItem.update({
            where: { id: inventoryItem.id },
            data: {
              allocatedQuantity: { increment: requiredQty }
            }
          })
        )
    )
    
    // 4. Create order (will rollback allocations if this fails)
    return await tx.productionOrder.create({
      data: { /* order data */ }
    })
  })
  
  console.log(`✅ Work order created and stock allocated: ${order.id}`)
}

// UPDATE STATUS WITH DEDUCTION
if (newStatus === 'in_production' && oldStatus === 'requested') {
  await prisma.$transaction(async (tx) => {
    // 1. Re-fetch order within transaction for consistency
    const order = await tx.productionOrder.findUnique({ where: { id } })
    if (!order || order.status !== 'requested') {
      throw new Error('Order not found or already processed')
    }
    
    if (!order.bomId) {
      throw new Error('Order has no BOM')
    }
    
    // 2. Fetch BOM and components
    const bom = await tx.bOM.findUnique({ where: { id: order.bomId } })
    if (!bom) throw new Error('BOM not found')
    
    const components = parseJson(bom.components, [])
    
    // 3. Validate and deduct all components atomically
    await Promise.all(
      components
        .filter(c => c.sku && c.quantity)
        .map(async (component) => {
          const requiredQty = parseFloat(component.quantity) * order.quantity
          
          // Use atomic update with optimistic lock
          const result = await tx.inventoryItem.updateMany({
            where: {
              sku: component.sku,
              quantity: { gte: requiredQty },
              allocatedQuantity: { gte: requiredQty }
            },
            data: {
              quantity: { decrement: requiredQty },
              allocatedQuantity: { decrement: requiredQty },
              // Update status based on new available quantity
            }
          })
          
          if (result.count === 0) {
            const item = await tx.inventoryItem.findFirst({ where: { sku: component.sku } })
            throw new Error(`Cannot deduct ${requiredQty} of ${component.sku}. Available: ${item?.quantity || 0}, Allocated: ${item?.allocatedQuantity || 0}`)
          }
          
          // Create stock movement
          await tx.stockMovement.create({
            data: { /* movement data */ }
          })
        })
    )
    
    // 4. Update order status
    await tx.productionOrder.update({
      where: { id },
      data: { status: 'in_production' }
    })
  })
  
  console.log(`✅ Stock deducted and order status updated: ${id}`)
}
```

## 📊 SUMMARY

| Issue | Priority | Impact | Fix Complexity |
|-------|----------|--------|----------------|
| No Transactions | 🔴 HIGH | Data corruption, orphaned records | Medium |
| Race Conditions | 🔴 HIGH | Negative stock, over-allocation | Medium |
| No Idempotency | 🟡 MEDIUM | Double deduction | Low |
| Silent Failures | 🟡 MEDIUM | Bad UX, hard to debug | Low |
| No Rollback | 🟡 MEDIUM | Inconsistent state | Medium |

## 🎯 IMMEDIATE ACTION REQUIRED

1. **Wrap allocation + order creation in transaction**
2. **Add idempotency check for status changes**
3. **Fail fast on missing inventory items**
4. **Use atomic updates with optimistic locking**

