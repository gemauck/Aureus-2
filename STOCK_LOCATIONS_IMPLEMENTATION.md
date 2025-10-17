# Stock Locations System Implementation

## Overview
This document outlines the implementation of a comprehensive stock location management system for Abcotronics ERP, including service LDV (Light Delivery Vehicle) tracking.

## Features Implemented

### 1. Stock Locations Management
- **Main Warehouse**: Central storage facility
- **Service LDVs**: Mobile inventory on service vehicles
- **Depots/Branches**: Satellite locations
- **Field Locations**: Temporary storage sites

### 2. Location Types
- **Warehouse**: Fixed storage locations with sections/bins
- **Vehicle**: Service LDVs with registration numbers
- **Site**: Customer/project sites
- **Transit**: Items in transit between locations

### 3. Key Functionality
- Create and manage stock locations
- Assign inventory to specific locations
- Transfer stock between locations
- View inventory by location
- Track service vehicle stock levels
- Low stock alerts per location
- Location-based reports

### 4. Service LDV Features
- Vehicle registration tracking
- Driver assignment
- Current location/status
- Inventory allocation per vehicle
- Vehicle load capacity tracking
- Service route planning
- Return to depot tracking

## Data Structure

### Stock Location Object
```javascript
{
  id: "LOC001",
  code: "WH-MAIN",
  name: "Main Warehouse",
  type: "warehouse", // warehouse, vehicle, site, transit
  status: "active",
  address: "123 Industrial Rd, Johannesburg",
  contactPerson: "John Doe",
  contactPhone: "+27 11 123 4567",
  // Vehicle-specific fields
  vehicleReg: "ABC123GP", // For LDVs
  driver: "David Buttemer",
  capacity: 500, // kg or volume
  currentLoad: 150,
  lastUpdated: "2025-01-15"
}
```

### Location Inventory Object
```javascript
{
  locationId: "LOC001",
  itemId: "INV001",
  sku: "GPS-MOD-001",
  itemName: "GPS Module",
  quantity: 50,
  reorderPoint: 10,
  lastRestocked: "2025-01-15",
  status: "in_stock"
}
```

### Stock Transfer Object
```javascript
{
  id: "TRF001",
  date: "2025-01-15",
  fromLocation: "LOC001",
  toLocation: "LOC002",
  items: [{
    sku: "GPS-MOD-001",
    quantity: 10,
    reason: "Stock replenishment"
  }],
  performedBy: "Gareth Mauck",
  status: "completed", // pending, in_transit, completed, cancelled
  notes: "Weekly LDV stock replenishment"
}
```

## Implementation Steps

### Phase 1: Data Structure Setup
1. Add `stockLocations` state array
2. Add `locationInventory` state array
3. Add `stockTransfers` state array
4. Update localStorage keys

### Phase 2: UI Components
1. Create "Locations" tab in Manufacturing module
2. Add location management modal
3. Add stock transfer modal
4. Create location-based inventory view
5. Add service LDV dashboard

### Phase 3: Business Logic
1. Implement location CRUD operations
2. Add stock transfer validation
3. Update inventory on transfers
4. Add location-based stock alerts
5. Implement vehicle capacity tracking

### Phase 4: Integration
1. Update inventory modal to select location
2. Modify stock movements to track locations
3. Add production order location assignment
4. Integrate with existing inventory system

## Usage Workflow

### Adding a New Stock Location
1. Navigate to Locations tab
2. Click "Add Location"
3. Select type (Warehouse/Vehicle/Site)
4. Enter details (name, code, address)
5. For LDVs: Add vehicle reg, driver, capacity
6. Save location

### Recording Stock in LDV
1. Navigate to Locations tab
2. Select service LDV
3. Click "Allocate Stock"
4. Select items and quantities
5. Confirm transfer from warehouse
6. System creates transfer record and updates inventory

### Transferring Stock Between Locations
1. Navigate to Stock Movements tab
2. Click "Transfer Stock"
3. Select from/to locations
4. Add items and quantities
5. Enter reason and notes
6. Submit transfer
7. System updates both locations' inventory

### Viewing LDV Inventory
1. Navigate to Locations tab
2. Filter by type: "Vehicle"
3. Click on LDV to view details
4. See current stock levels
5. View capacity utilization
6. Check low stock items

## Benefits

### For Operations
- Real-time visibility of stock across all locations
- Prevent stockouts at service locations
- Optimize stock distribution
- Track service vehicle inventory

### For Technicians
- Know exact stock available in their LDV
- Request stock replenishment
- Report usage from field

### For Management
- Monitor stock distribution
- Identify slow-moving inventory by location
- Optimize vehicle loading
- Track transfer costs

### For Inventory Control
- Accurate stock counts per location
- Audit trail for all movements
- Prevent stock discrepancies
- Better demand forecasting

## Next Steps

1. Implement the UI components in Manufacturing.jsx
2. Add location selection to inventory items
3. Create transfer workflow
4. Build location-based reports
5. Add mobile-friendly LDV interface
6. Integrate with barcode scanning (future)
7. Add GPS tracking for vehicles (future)

## Technical Notes

### localStorage Keys
- `stock_locations`: Array of location objects
- `location_inventory`: Array of location-specific inventory
- `stock_transfers`: Array of transfer records

### State Management
All managed in Manufacturing component with proper useEffect hooks for persistence.

### Validation Rules
- Cannot transfer more than available quantity
- Vehicle capacity cannot be exceeded
- Transfer requires from and to locations
- Items must exist in inventory
- Admin approval for large transfers (optional)

## Testing Checklist

- [ ] Create warehouse location
- [ ] Create service LDV with vehicle details
- [ ] Allocate stock to LDV
- [ ] Transfer stock between locations
- [ ] View inventory by location
- [ ] Check capacity warnings
- [ ] Test low stock alerts per location
- [ ] Verify transfer audit trail
- [ ] Test location deletion (with stock checks)
- [ ] Export location reports
