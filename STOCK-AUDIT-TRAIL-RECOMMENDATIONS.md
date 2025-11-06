# Stock Audit Trail Recommendations

## Current Audit Trail Features ✅

The system currently tracks:
- **Movement ID** (MOV0001, MOV0002, etc.) - Unique identifier for each movement
- **Date and Timestamps** - When the movement occurred
- **User who performed the action** (performedBy) - Who made the change
- **Movement Type** - Receipt, Consumption, Adjustment, Transfer, etc.
- **Quantity Changes** - How much stock changed
- **Reference Numbers** - Links to Purchase Orders, Sales Orders, Production Orders
- **Notes/Descriptions** - Additional context about the movement
- **Location Tracking** - From/to locations for transfers

## Recommendations for 100% Audit Trail

### 1. **Before/After Quantities** ⭐ High Priority
   - Show quantity before and after each movement
   - Example: "100 → 150" (receipt of 50) or "100 → 80" (consumption of 20)
   - **Value**: Makes it immediately clear what the stock level was before and after
   - **Implementation**: Store `quantityBefore` and `quantityAfter` in stock movements table

### 2. **Movement Status & Reversals** ⭐ Critical for Audit Integrity
   - Status field: `pending`, `approved`, `completed`, `reversed`
   - Ability to reverse/cancel movements (creates a reversal entry)
   - **Prevent deletion** - mark as reversed instead
   - **Value**: Ensures no movements are ever truly deleted, maintaining complete history
   - **Implementation**: Add `status` field, `reversedBy`, `reversedAt`, `reversalReason`

### 3. **Cost Tracking at Time of Movement** ⭐ High Value for Accounting
   - Store unit cost at the time of each movement
   - Calculate value change per transaction
   - Useful for FIFO/LIFO costing methods
   - **Value**: Accurate cost accounting and inventory valuation
   - **Implementation**: Store `unitCostAtMovement` and `totalValueChange` in movements

### 4. **Related Document Links**
   - Clickable links to Purchase Orders, Sales Orders, Production Orders
   - Direct navigation to source documents
   - **Value**: Quick access to supporting documentation
   - **Implementation**: Store `relatedOrderId` and `relatedOrderType` fields

### 5. **Approval Workflow** (Optional)
   - Require approval for large movements or adjustments
   - Track approver and approval timestamp
   - **Value**: Prevents unauthorized large changes
   - **Implementation**: Add `requiresApproval`, `approvedBy`, `approvedAt` fields

### 6. **Movement History/Versioning**
   - Track edits to movements (who changed what and when)
   - Show original vs modified values
   - **Value**: Complete change history
   - **Implementation**: Create `stockMovementHistory` table for audit log

### 7. **Batch/Lot & Serial Number Tracking**
   - Track batch/lot numbers for traceability
   - Serial numbers for high-value items
   - Expiry dates for perishable items
   - **Value**: Critical for recalls and quality control
   - **Implementation**: Add `batchNumber`, `lotNumber`, `serialNumber`, `expiryDate` fields

### 8. **Physical Verification**
   - Photo attachments for receipts/adjustments
   - Stock count reconciliation records
   - **Value**: Visual proof of physical stock
   - **Implementation**: Add `attachmentUrl` or `attachments` array field

### 9. **Movement Categories/Subtypes**
   - **Receipt**: Purchase, Return, Production Complete, Transfer In
   - **Consumption**: Sale, Production Use, Waste, Damage, Transfer Out
   - **Adjustment**: Count Correction, Write-off, Theft, Expired
   - **Value**: Better categorization and reporting
   - **Implementation**: Add `subtype` or `category` field

### 10. **Reporting & Analytics**
    - Movement history export (CSV/PDF)
    - Stock movement reports by date range, item, user
    - Discrepancy reports (expected vs actual)
    - **Value**: Compliance and analysis
    - **Implementation**: Create reporting endpoints and UI

## Priority Implementation Order

### Phase 1 (Critical - Do First)
1. **Before/After Quantities** - Easy to implement, high visual value
2. **Movement Reversals** - Critical for audit integrity, prevents data loss
3. **Cost Tracking** - Important for accurate accounting

### Phase 2 (High Value)
4. **Related Document Links** - Improves usability
5. **Movement Categories/Subtypes** - Better organization
6. **Reporting & Analytics** - Essential for compliance

### Phase 3 (Advanced Features)
7. **Approval Workflow** - If needed for your business
8. **Batch/Lot Tracking** - If dealing with traceable items
9. **Physical Verification** - If photos are needed
10. **Movement History/Versioning** - Advanced audit trail

## Database Schema Recommendations

```prisma
model StockMovement {
  id                String   @id @default(cuid())
  movementId       String   @unique // MOV0001, etc.
  date             DateTime
  type             String   // receipt, consumption, adjustment, transfer
  subtype          String?  // purchase, sale, waste, correction, etc.
  status           String   @default("completed") // pending, approved, completed, reversed
  
  // Item Information
  sku              String
  itemName         String
  
  // Quantity Tracking
  quantity         Float    // Positive for receipts, negative for consumption
  quantityBefore   Float?   // Stock level before this movement
  quantityAfter    Float?   // Stock level after this movement
  
  // Cost Tracking
  unitCostAtMovement Float? // Cost at time of movement
  totalValueChange   Float? // Value change (quantity * unitCost)
  
  // Location Tracking
  fromLocation     String?
  toLocation       String?
  fromLocationId   String?
  toLocationId     String?
  
  // Audit Fields
  reference        String?  // PO, SO, WO numbers
  notes            String?
  performedBy      String   // User who created the movement
  approvedBy       String?  // User who approved (if required)
  approvedAt       DateTime?
  
  // Reversal Tracking
  reversedBy       String?
  reversedAt       DateTime?
  reversalReason   String?
  originalMovementId String? // If this is a reversal
  
  // Related Documents
  relatedOrderId   String?
  relatedOrderType String?  // purchase_order, sales_order, production_order
  
  // Batch/Lot Tracking
  batchNumber      String?
  lotNumber        String?
  serialNumber     String?
  expiryDate       DateTime?
  
  // Attachments
  attachmentUrl    String?
  
  // Timestamps
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  
  @@index([sku])
  @@index([date])
  @@index([type])
  @@index([performedBy])
  @@index([status])
}
```

## Implementation Notes

- **Never delete movements** - Always mark as reversed
- **Calculate before/after quantities** at movement creation time
- **Store cost at movement time** - Don't rely on current cost
- **Index frequently queried fields** for performance
- **Add validation** to ensure quantityBefore + quantity = quantityAfter
- **Add constraints** to prevent negative stock (or allow with warnings)

## Benefits of Complete Audit Trail

1. **Compliance** - Meet regulatory requirements
2. **Accountability** - Know who did what and when
3. **Error Detection** - Identify discrepancies quickly
4. **Cost Accuracy** - Proper inventory valuation
5. **Traceability** - Track items from receipt to sale
6. **Dispute Resolution** - Historical records for investigations
7. **Reporting** - Generate accurate financial and operational reports

