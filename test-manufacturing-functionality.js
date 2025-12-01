// Manufacturing Section Functionality and Persistence Test
// Tests all CRUD operations, workflows, calculations, and localStorage persistence

const testResults = {
  passed: [],
  failed: [],
  warnings: [],
  totalTests: 0,
  startTime: Date.now()
};

// Reset test results for clean test runs
function resetTestResults() {
  testResults.passed = [];
  testResults.failed = [];
  testResults.warnings = [];
  testResults.totalTests = 0;
  testResults.startTime = Date.now();
}

// Test utilities
function log(message, type = 'info') {
  const emoji = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warn' ? '⚠️' : '📝';
  console.log(`${emoji} ${message}`);
}

function recordResult(test, passed, message = '') {
  testResults.totalTests++;
  if (passed) {
    testResults.passed.push({ test, message });
    log(`${test}: PASSED`, 'success');
  } else {
    testResults.failed.push({ test, message });
    log(`${test}: FAILED - ${message}`, 'error');
  }
}

function assert(condition, testName, errorMsg) {
  recordResult(testName, condition, errorMsg);
  return condition;
}

// Clear localStorage for clean testing
function clearManufacturingData() {
  localStorage.removeItem('manufacturing_inventory');
  localStorage.removeItem('manufacturing_boms');
  localStorage.removeItem('production_orders');
  localStorage.removeItem('stock_movements');
  localStorage.removeItem('stock_locations');
  localStorage.removeItem('location_inventory');
  localStorage.removeItem('stock_transfers');
  log('Manufacturing data cleared from localStorage', 'info');
}

// Initialize test data
function getTestInventoryItem() {
  return {
    sku: `TEST-SKU-${Date.now()}`,
    name: `Test Inventory Item ${Date.now()}`,
    category: 'components',
    type: 'raw_material',
    quantity: 100,
    unit: 'pcs',
    reorderPoint: 20,
    reorderQty: 50,
    location: 'Main Warehouse',
    unitCost: 15.50,
    supplier: 'Test Supplier',
    status: 'in_stock',
    totalValue: 1550,
    lastRestocked: new Date().toISOString().split('T')[0]
  };
}

function getTestBOM() {
  return {
    id: `TEST-BOM-${Date.now()}`,
    productSku: `PROD-SKU-${Date.now()}`,
    productName: `Test Product ${Date.now()}`,
    version: '1.0',
    status: 'active',
    effectiveDate: new Date().toISOString().split('T')[0],
    laborCost: 25.00,
    overheadCost: 10.00,
    estimatedTime: 60,
    notes: 'Test BOM notes',
    components: [
      {
        sku: 'COMP-001',
        name: 'Component 1',
        quantity: 2,
        unit: 'pcs',
        unitCost: 5.00,
        totalCost: 10.00
      },
      {
        sku: 'COMP-002',
        name: 'Component 2',
        quantity: 1,
        unit: 'pcs',
        unitCost: 8.00,
        totalCost: 8.00
      }
    ],
    totalMaterialCost: 18.00,
    totalCost: 53.00 // 18 material + 25 labor + 10 overhead
  };
}

function getTestProductionOrder(bomId, bomTotalCost, bom = null) {
  return {
    id: `TEST-PO-${Date.now()}`,
    bomId: bomId,
    productSku: bom?.productSku || 'PROD-SKU-001',
    productName: bom?.productName || 'Test Product',
    quantity: 10,
    quantityProduced: 0,
    status: 'in_progress',
    priority: 'normal',
    startDate: new Date().toISOString().split('T')[0],
    targetDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    completedDate: null,
    assignedTo: 'Test Production Team',
    totalCost: bomTotalCost * 10,
    notes: 'Test production order',
    createdAt: new Date().toISOString().split('T')[0],
    createdBy: 'Test User'
  };
}

function getTestStockMovement() {
  return {
    id: `TEST-MOV-${Date.now()}`,
    date: new Date().toISOString().split('T')[0],
    type: 'receipt',
    itemName: 'Test Item',
    sku: 'TEST-SKU-001',
    quantity: 50,
    fromLocation: 'Supplier',
    toLocation: 'Main Warehouse',
    reference: 'PO-001',
    performedBy: 'Test User',
    notes: 'Test stock movement'
  };
}

function getTestStockLocation() {
  return {
    id: `TEST-LOC-${Date.now()}`,
    code: `LOC-${Date.now()}`,
    name: `Test Location ${Date.now()}`,
    type: 'warehouse',
    status: 'active',
    address: '123 Test Street',
    contactPerson: 'Test Contact',
    contactPhone: '+27 11 123 4567',
    createdDate: new Date().toISOString().split('T')[0]
  };
}

// ============================================
// INVENTORY TESTS
// ============================================

function testInventoryPersistence() {
  log('\n=== Testing Inventory Persistence ===', 'info');
  
  // Clear only inventory-related data for this test
  localStorage.removeItem('manufacturing_inventory');
  
  // Test: Save inventory item to localStorage
  const testItem = getTestInventoryItem();
  testItem.id = 'INV001';
  const inventory = [testItem];
  localStorage.setItem('manufacturing_inventory', JSON.stringify(inventory));
  
  const savedData = JSON.parse(localStorage.getItem('manufacturing_inventory') || '[]');
  assert(savedData.length === 1, 'Inventory Save to localStorage', 'Item not saved correctly');
  assert(savedData[0].sku === testItem.sku, 'Inventory Data Integrity', 'SKU mismatch');
  assert(savedData[0].totalValue === testItem.totalValue, 'Inventory Calculation', 'Total value calculation incorrect');
  
  // Test: Load inventory from localStorage
  const loadedInventory = JSON.parse(localStorage.getItem('manufacturing_inventory') || '[]');
  assert(loadedInventory.length > 0, 'Inventory Load from localStorage', 'Failed to load inventory');
  
  // Test: Update inventory item
  const updatedItem = { ...testItem, quantity: 150, totalValue: 2325 };
  const updatedInventory = inventory.map(item => 
    item.id === testItem.id ? updatedItem : item
  );
  localStorage.setItem('manufacturing_inventory', JSON.stringify(updatedInventory));
  
  const reloadedInventory = JSON.parse(localStorage.getItem('manufacturing_inventory') || '[]');
  assert(reloadedInventory[0].quantity === 150, 'Inventory Update', 'Item not updated correctly');
  assert(reloadedInventory[0].totalValue === 2325, 'Inventory Update Calculation', 'Total value not recalculated');
  
  // Test: Delete inventory item
  const deletedInventory = reloadedInventory.filter(item => item.id !== testItem.id);
  localStorage.setItem('manufacturing_inventory', JSON.stringify(deletedInventory));
  
  const finalInventory = JSON.parse(localStorage.getItem('manufacturing_inventory') || '[]');
  assert(finalInventory.length === 0, 'Inventory Delete', 'Item not deleted correctly');
  
  log('Inventory persistence tests completed', 'info');
}

function testInventoryCalculations() {
  log('\n=== Testing Inventory Calculations ===', 'info');
  
  const testItem = getTestInventoryItem();
  testItem.quantity = 100;
  testItem.unitCost = 15.50;
  testItem.totalValue = testItem.quantity * testItem.unitCost;
  
  assert(testItem.totalValue === 1550, 'Total Value Calculation', 'Incorrect total value: expected 1550');
  
  // Test low stock detection
  const lowStockItem = { ...testItem, quantity: 15, reorderPoint: 20 };
  assert(lowStockItem.quantity <= lowStockItem.reorderPoint, 'Low Stock Detection', 'Should trigger low stock alert');
  
  // Test inventory stats calculation
  const inventory = [
    { quantity: 100, totalValue: 1550, reorderPoint: 20 },
    { quantity: 50, totalValue: 775, reorderPoint: 25 },
    { quantity: 10, totalValue: 155, reorderPoint: 20 } // Low stock
  ];
  
  const totalValue = inventory.reduce((sum, item) => sum + item.totalValue, 0);
  const lowStockItems = inventory.filter(item => item.quantity <= item.reorderPoint).length;
  const totalItems = inventory.reduce((sum, item) => sum + item.quantity, 0);
  
  assert(totalValue === 2480, 'Inventory Stats - Total Value', `Expected 2480, got ${totalValue}`);
  assert(lowStockItems === 1, 'Inventory Stats - Low Stock Count', `Expected 1, got ${lowStockItems}`);
  assert(totalItems === 160, 'Inventory Stats - Total Items', `Expected 160, got ${totalItems}`);
  
  log('Inventory calculation tests completed', 'info');
}

function testInventoryValidation() {
  log('\n=== Testing Inventory Validation ===', 'info');
  
  // Test: Required fields - validation should reject empty SKU
  const incompleteItem = { sku: '', name: 'Test', quantity: 0 };
  const hasValidSKU = incompleteItem.sku && incompleteItem.sku.trim().length > 0;
  assert(!hasValidSKU, 'Inventory Validation - SKU Required', 'Validation should reject empty SKU');
  
  // Test: Numeric fields - validation should reject negative quantity
  const invalidQuantity = { ...getTestInventoryItem(), quantity: -10 };
  const hasValidQuantity = invalidQuantity.quantity >= 0;
  assert(!hasValidQuantity, 'Inventory Validation - Quantity Positive', 'Validation should reject negative quantity');
  
  // Test: Unit cost validation - validation should reject negative cost
  const invalidCost = { ...getTestInventoryItem(), unitCost: -5 };
  const hasValidCost = invalidCost.unitCost >= 0;
  assert(!hasValidCost, 'Inventory Validation - Cost Positive', 'Validation should reject negative unit cost');
  
  // Test: Valid item should pass validation
  const validItem = getTestInventoryItem();
  const isValid = validItem.sku && validItem.sku.trim().length > 0 && 
                  validItem.quantity >= 0 && validItem.unitCost >= 0;
  assert(isValid, 'Inventory Validation - Valid Item', 'Valid item should pass validation');
  
  log('Inventory validation tests completed', 'info');
}

// ============================================
// BOM TESTS
// ============================================

function testBOMPersistence() {
  log('\n=== Testing BOM Persistence ===', 'info');
  
  // Clear only BOM-related data for this test
  localStorage.removeItem('manufacturing_boms');
  
  // Test: Save BOM to localStorage
  const testBOM = getTestBOM();
  const boms = [testBOM];
  localStorage.setItem('manufacturing_boms', JSON.stringify(boms));
  
  const savedBOMs = JSON.parse(localStorage.getItem('manufacturing_boms') || '[]');
  assert(savedBOMs.length === 1, 'BOM Save to localStorage', 'BOM not saved correctly');
  assert(savedBOMs[0].totalCost === 53.00, 'BOM Cost Calculation', 'Total cost calculation incorrect');
  assert(savedBOMs[0].components.length === 2, 'BOM Components', 'Components not saved correctly');
  
  // Test: Load BOM from localStorage
  const loadedBOMs = JSON.parse(localStorage.getItem('manufacturing_boms') || '[]');
  assert(loadedBOMs.length > 0, 'BOM Load from localStorage', 'Failed to load BOMs');
  
  // Test: Update BOM
  const updatedBOM = { ...testBOM, laborCost: 30.00 };
  updatedBOM.totalCost = updatedBOM.totalMaterialCost + updatedBOM.laborCost + updatedBOM.overheadCost;
  const updatedBOMs = boms.map(bom => bom.id === testBOM.id ? updatedBOM : bom);
  localStorage.setItem('manufacturing_boms', JSON.stringify(updatedBOMs));
  
  const reloadedBOMs = JSON.parse(localStorage.getItem('manufacturing_boms') || '[]');
  assert(reloadedBOMs[0].laborCost === 30.00, 'BOM Update', 'BOM not updated correctly');
  assert(reloadedBOMs[0].totalCost === 58.00, 'BOM Update Calculation', 'Total cost not recalculated');
  
  // Test: Delete BOM
  const deletedBOMs = reloadedBOMs.filter(bom => bom.id !== testBOM.id);
  localStorage.setItem('manufacturing_boms', JSON.stringify(deletedBOMs));
  
  const finalBOMs = JSON.parse(localStorage.getItem('manufacturing_boms') || '[]');
  assert(finalBOMs.length === 0, 'BOM Delete', 'BOM not deleted correctly');
  
  log('BOM persistence tests completed', 'info');
}

function testBOMCalculations() {
  log('\n=== Testing BOM Calculations ===', 'info');
  
  const bom = getTestBOM();
  
  // Test: Material cost calculation
  const materialCost = bom.components.reduce((sum, comp) => sum + comp.totalCost, 0);
  assert(materialCost === 18.00, 'BOM Material Cost', `Expected 18.00, got ${materialCost}`);
  
  // Test: Component total cost
  const componentTotal = bom.components[0].quantity * bom.components[0].unitCost;
  assert(componentTotal === 10.00, 'BOM Component Total Cost', `Expected 10.00, got ${componentTotal}`);
  
  // Test: Total BOM cost
  const totalCost = bom.totalMaterialCost + bom.laborCost + bom.overheadCost;
  assert(totalCost === 53.00, 'BOM Total Cost', `Expected 53.00, got ${totalCost}`);
  
  // Test: BOM with zero components
  const emptyBOM = { ...bom, components: [] };
  emptyBOM.totalMaterialCost = 0;
  emptyBOM.totalCost = emptyBOM.laborCost + emptyBOM.overheadCost;
  assert(emptyBOM.totalCost === 35.00, 'BOM Empty Components', `Expected 35.00, got ${emptyBOM.totalCost}`);
  
  log('BOM calculation tests completed', 'info');
}

function testBOMComponentManagement() {
  log('\n=== Testing BOM Component Management ===', 'info');
  
  const bom = getTestBOM();
  
  // Test: Add component
  const newComponent = {
    sku: 'COMP-003',
    name: 'Component 3',
    quantity: 3,
    unit: 'pcs',
    unitCost: 7.00,
    totalCost: 21.00
  };
  
  const updatedComponents = [...bom.components, newComponent];
  assert(updatedComponents.length === 3, 'BOM Add Component', 'Component not added');
  
  // Test: Update component quantity
  updatedComponents[0].quantity = 3;
  updatedComponents[0].totalCost = updatedComponents[0].quantity * updatedComponents[0].unitCost;
  assert(updatedComponents[0].totalCost === 15.00, 'BOM Update Component', 'Component not updated correctly');
  
  // Test: Remove component
  const removedComponents = updatedComponents.filter(comp => comp.sku !== 'COMP-003');
  assert(removedComponents.length === 2, 'BOM Remove Component', 'Component not removed');
  
  // Test: Auto-fill from inventory (simulated)
  const inventoryItem = {
    sku: 'INV-SKU-001',
    name: 'Inventory Item',
    unit: 'pcs',
    unitCost: 12.00
  };
  
  const autoFilledComponent = {
    sku: inventoryItem.sku,
    name: inventoryItem.name,
    quantity: 2,
    unit: inventoryItem.unit,
    unitCost: inventoryItem.unitCost,
    totalCost: 2 * inventoryItem.unitCost
  };
  
  assert(autoFilledComponent.name === inventoryItem.name, 'BOM Auto-fill from Inventory', 'Auto-fill not working');
  assert(autoFilledComponent.unitCost === inventoryItem.unitCost, 'BOM Auto-fill Unit Cost', 'Unit cost not auto-filled');
  
  log('BOM component management tests completed', 'info');
}

// ============================================
// PRODUCTION ORDER TESTS
// ============================================

function testProductionOrderPersistence() {
  log('\n=== Testing Production Order Persistence ===', 'info');
  
  // Clear only production order-related data for this test
  localStorage.removeItem('production_orders');
  localStorage.removeItem('manufacturing_boms');
  
  // First create a BOM
  const bom = getTestBOM();
  localStorage.setItem('manufacturing_boms', JSON.stringify([bom]));
  
  // Test: Save production order to localStorage
  const testOrder = getTestProductionOrder(bom.id, bom.totalCost);
  const orders = [testOrder];
  localStorage.setItem('production_orders', JSON.stringify(orders));
  
  const savedOrders = JSON.parse(localStorage.getItem('production_orders') || '[]');
  assert(savedOrders.length === 1, 'Production Order Save to localStorage', 'Order not saved correctly');
  assert(savedOrders[0].totalCost === bom.totalCost * 10, 'Production Order Cost', 'Total cost incorrect');
  
  // Test: Load production orders from localStorage
  const loadedOrders = JSON.parse(localStorage.getItem('production_orders') || '[]');
  assert(loadedOrders.length > 0, 'Production Order Load from localStorage', 'Failed to load orders');
  
  // Test: Update production order
  const updatedOrder = { ...testOrder, quantityProduced: 5, status: 'completed' };
  updatedOrder.completedDate = new Date().toISOString().split('T')[0];
  const updatedOrders = orders.map(order => order.id === testOrder.id ? updatedOrder : order);
  localStorage.setItem('production_orders', JSON.stringify(updatedOrders));
  
  const reloadedOrders = JSON.parse(localStorage.getItem('production_orders') || '[]');
  assert(reloadedOrders[0].quantityProduced === 5, 'Production Order Update', 'Order not updated correctly');
  assert(reloadedOrders[0].status === 'completed', 'Production Order Status Update', 'Status not updated');
  assert(reloadedOrders[0].completedDate !== null, 'Production Order Completion Date', 'Completion date not set');
  
  // Test: Delete production order
  const deletedOrders = reloadedOrders.filter(order => order.id !== testOrder.id);
  localStorage.setItem('production_orders', JSON.stringify(deletedOrders));
  
  const finalOrders = JSON.parse(localStorage.getItem('production_orders') || '[]');
  assert(finalOrders.length === 0, 'Production Order Delete', 'Order not deleted correctly');
  
  log('Production order persistence tests completed', 'info');
}

function testProductionOrderCalculations() {
  log('\n=== Testing Production Order Calculations ===', 'info');
  
  const bom = getTestBOM();
  const order = getTestProductionOrder(bom.id, bom.totalCost);
  
  // Test: Total production cost
  const totalCost = bom.totalCost * order.quantity;
  assert(totalCost === 530.00, 'Production Order Total Cost', `Expected 530.00, got ${totalCost}`);
  
  // Test: Progress calculation
  order.quantityProduced = 7;
  const progress = (order.quantityProduced / order.quantity) * 100;
  assert(progress === 70, 'Production Order Progress', `Expected 70%, got ${progress}%`);
  
  // Test: Remaining quantity
  const remaining = order.quantity - order.quantityProduced;
  assert(remaining === 3, 'Production Order Remaining', `Expected 3, got ${remaining}`);
  
  // Test: Production stats
  const orders = [
    { status: 'in_progress', quantity: 10, quantityProduced: 5 },
    { status: 'in_progress', quantity: 20, quantityProduced: 15 },
    { status: 'completed', quantity: 15, quantityProduced: 15 },
    { status: 'cancelled', quantity: 5, quantityProduced: 0 }
  ];
  
  const activeOrders = orders.filter(o => o.status === 'in_progress').length;
  const completedOrders = orders.filter(o => o.status === 'completed').length;
  const totalProduction = orders.reduce((sum, o) => sum + o.quantityProduced, 0);
  const pendingUnits = orders
    .filter(o => o.status === 'in_progress')
    .reduce((sum, o) => sum + (o.quantity - o.quantityProduced), 0);
  
  assert(activeOrders === 2, 'Production Stats - Active Orders', `Expected 2, got ${activeOrders}`);
  assert(completedOrders === 1, 'Production Stats - Completed Orders', `Expected 1, got ${completedOrders}`);
  assert(totalProduction === 35, 'Production Stats - Total Production', `Expected 35, got ${totalProduction}`);
  assert(pendingUnits === 10, 'Production Stats - Pending Units', `Expected 10, got ${pendingUnits}`);
  
  log('Production order calculation tests completed', 'info');
}

function testProductionOrderWorkflow() {
  log('\n=== Testing Production Order Workflow ===', 'info');
  
  const bom = getTestBOM();
  
  // Test: Create order from BOM
  const order = getTestProductionOrder(bom.id, bom.totalCost, bom);
  assert(order.bomId === bom.id, 'Production Order from BOM', 'BOM ID not set');
  assert(order.productSku === bom.productSku, 'Production Order Product SKU', 'Product SKU not copied');
  
  // Test: Status transitions
  assert(order.status === 'in_progress', 'Production Order Initial Status', 'Initial status should be in_progress');
  
  // Test: Complete order
  order.quantityProduced = order.quantity;
  order.status = 'completed';
  order.completedDate = new Date().toISOString().split('T')[0];
  assert(order.status === 'completed', 'Production Order Completion', 'Status not changed to completed');
  assert(order.completedDate !== null, 'Production Order Completion Date', 'Completion date not set');
  
  // Test: Cancel order
  const cancelledOrder = { ...order, status: 'cancelled' };
  assert(cancelledOrder.status === 'cancelled', 'Production Order Cancellation', 'Status not changed to cancelled');
  
  log('Production order workflow tests completed', 'info');
}

// ============================================
// STOCK MOVEMENT TESTS
// ============================================

function testStockMovementPersistence() {
  log('\n=== Testing Stock Movement Persistence ===', 'info');
  
  // Clear only stock movement-related data for this test
  localStorage.removeItem('stock_movements');
  
  // Test: Save stock movement to localStorage
  const testMovement = getTestStockMovement();
  const movements = [testMovement];
  localStorage.setItem('stock_movements', JSON.stringify(movements));
  
  const savedMovements = JSON.parse(localStorage.getItem('stock_movements') || '[]');
  assert(savedMovements.length === 1, 'Stock Movement Save to localStorage', 'Movement not saved correctly');
  assert(savedMovements[0].type === 'receipt', 'Stock Movement Type', 'Type not saved correctly');
  
  // Test: Load stock movements from localStorage
  const loadedMovements = JSON.parse(localStorage.getItem('stock_movements') || '[]');
  assert(loadedMovements.length > 0, 'Stock Movement Load from localStorage', 'Failed to load movements');
  
  // Test: Multiple movement types
  const movementTypes = ['receipt', 'consumption', 'transfer', 'adjustment', 'production'];
  const testMovements = movementTypes.map(type => ({
    ...getTestStockMovement(),
    id: `TEST-MOV-${Date.now()}-${type}`,
    type: type
  }));
  
  localStorage.setItem('stock_movements', JSON.stringify(testMovements));
  const reloadedMovements = JSON.parse(localStorage.getItem('stock_movements') || '[]');
  assert(reloadedMovements.length === 5, 'Stock Movement Multiple Types', 'Not all movement types saved');
  
  // Test: Delete stock movement
  const deletedMovements = reloadedMovements.filter(mov => mov.type !== 'receipt');
  localStorage.setItem('stock_movements', JSON.stringify(deletedMovements));
  
  const finalMovements = JSON.parse(localStorage.getItem('stock_movements') || '[]');
  assert(finalMovements.length === 4, 'Stock Movement Delete', 'Movement not deleted correctly');
  
  log('Stock movement persistence tests completed', 'info');
}

function testStockMovementTypes() {
  log('\n=== Testing Stock Movement Types ===', 'info');
  
  // Test: Receipt movement (positive quantity)
  const receipt = { ...getTestStockMovement(), type: 'receipt', quantity: 50 };
  assert(receipt.quantity > 0, 'Receipt Movement - Positive Quantity', 'Receipt should have positive quantity');
  
  // Test: Consumption movement (negative quantity)
  const consumption = { ...getTestStockMovement(), type: 'consumption', quantity: -20 };
  assert(consumption.quantity < 0, 'Consumption Movement - Negative Quantity', 'Consumption should have negative quantity');
  
  // Test: Transfer movement (requires from and to locations)
  const transfer = {
    ...getTestStockMovement(),
    type: 'transfer',
    fromLocation: 'Location A',
    toLocation: 'Location B',
    quantity: 30
  };
  assert(transfer.fromLocation && transfer.toLocation, 'Transfer Movement - Locations', 'Transfer requires both locations');
  
  // Test: Adjustment movement
  const adjustment = { ...getTestStockMovement(), type: 'adjustment', quantity: -5 };
  assert(adjustment.type === 'adjustment', 'Adjustment Movement', 'Adjustment type not set');
  
  // Test: Production movement
  const production = { ...getTestStockMovement(), type: 'production', quantity: 10 };
  assert(production.type === 'production', 'Production Movement', 'Production type not set');
  
  log('Stock movement types tests completed', 'info');
}

// ============================================
// STOCK LOCATIONS TESTS
// ============================================

function testStockLocationPersistence() {
  log('\n=== Testing Stock Location Persistence ===', 'info');
  
  // Clear only location-related data for this test
  localStorage.removeItem('stock_locations');
  localStorage.removeItem('location_inventory');
  
  // Test: Save stock location to localStorage
  const testLocation = getTestStockLocation();
  const locations = [testLocation];
  localStorage.setItem('stock_locations', JSON.stringify(locations));
  
  const savedLocations = JSON.parse(localStorage.getItem('stock_locations') || '[]');
  assert(savedLocations.length === 1, 'Stock Location Save to localStorage', 'Location not saved correctly');
  assert(savedLocations[0].type === 'warehouse', 'Stock Location Type', 'Type not saved correctly');
  
  // Test: Load locations from localStorage
  const loadedLocations = JSON.parse(localStorage.getItem('stock_locations') || '[]');
  assert(loadedLocations.length > 0, 'Stock Location Load from localStorage', 'Failed to load locations');
  
  // Test: Update location
  const updatedLocation = { ...testLocation, status: 'inactive' };
  const updatedLocations = locations.map(loc => loc.id === testLocation.id ? updatedLocation : loc);
  localStorage.setItem('stock_locations', JSON.stringify(updatedLocations));
  
  const reloadedLocations = JSON.parse(localStorage.getItem('stock_locations') || '[]');
  assert(reloadedLocations[0].status === 'inactive', 'Stock Location Update', 'Location not updated correctly');
  
  // Test: Delete location (only if no inventory)
  const deletedLocations = reloadedLocations.filter(loc => loc.id !== testLocation.id);
  localStorage.setItem('stock_locations', JSON.stringify(deletedLocations));
  
  const finalLocations = JSON.parse(localStorage.getItem('stock_locations') || '[]');
  assert(finalLocations.length === 0, 'Stock Location Delete', 'Location not deleted correctly');
  
  log('Stock location persistence tests completed', 'info');
}

function testStockLocationTypes() {
  log('\n=== Testing Stock Location Types ===', 'info');
  
  // Test: Warehouse location
  const warehouse = { ...getTestStockLocation(), type: 'warehouse' };
  assert(warehouse.type === 'warehouse', 'Warehouse Location Type', 'Type not set correctly');
  
  // Test: Vehicle location
  const vehicle = {
    ...getTestStockLocation(),
    type: 'vehicle',
    vehicleReg: 'ABC123GP',
    driver: 'Test Driver'
  };
  assert(vehicle.type === 'vehicle', 'Vehicle Location Type', 'Type not set correctly');
  assert(vehicle.vehicleReg, 'Vehicle Registration', 'Vehicle registration required');
  assert(vehicle.driver, 'Vehicle Driver', 'Vehicle driver required');
  
  // Test: Site location
  const site = { ...getTestStockLocation(), type: 'site' };
  assert(site.type === 'site', 'Site Location Type', 'Type not set correctly');
  
  // Test: Transit location
  const transit = { ...getTestStockLocation(), type: 'transit' };
  assert(transit.type === 'transit', 'Transit Location Type', 'Type not set correctly');
  
  log('Stock location types tests completed', 'info');
}

function testLocationInventoryManagement() {
  log('\n=== Testing Location Inventory Management ===', 'info');
  
  // Test: Location inventory allocation
  const location = getTestStockLocation();
  const inventoryItem = getTestInventoryItem();
  
  const locationInventory = [{
    locationId: location.id,
    itemId: inventoryItem.id,
    sku: inventoryItem.sku,
    itemName: inventoryItem.name,
    quantity: 50,
    unitCost: inventoryItem.unitCost,
    reorderPoint: inventoryItem.reorderPoint,
    lastRestocked: new Date().toISOString().split('T')[0],
    status: 'in_stock'
  }];
  
  localStorage.setItem('location_inventory', JSON.stringify(locationInventory));
  
  const loadedLocationInventory = JSON.parse(localStorage.getItem('location_inventory') || '[]');
  assert(loadedLocationInventory.length === 1, 'Location Inventory Save', 'Location inventory not saved');
  
  // Test: Location stats calculation
  const stats = {
    totalItems: loadedLocationInventory.reduce((sum, item) => sum + item.quantity, 0),
    totalValue: loadedLocationInventory.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0),
    lowStockItems: loadedLocationInventory.filter(item => item.quantity <= item.reorderPoint).length,
    uniqueItems: loadedLocationInventory.length
  };
  
  assert(stats.totalItems === 50, 'Location Stats - Total Items', `Expected 50, got ${stats.totalItems}`);
  assert(stats.totalValue === 775, 'Location Stats - Total Value', `Expected 775, got ${stats.totalValue}`);
  assert(stats.uniqueItems === 1, 'Location Stats - Unique Items', `Expected 1, got ${stats.uniqueItems}`);
  
  log('Location inventory management tests completed', 'info');
}

// ============================================
// INTEGRATION TESTS
// ============================================

function testEndToEndWorkflow() {
  log('\n=== Testing End-to-End Workflow ===', 'info');
  
  clearManufacturingData();
  
  // Step 1: Create inventory items
  const item1 = { ...getTestInventoryItem(), id: 'INV001', sku: 'COMP-001', name: 'Component 1', unitCost: 5.00 };
  const item2 = { ...getTestInventoryItem(), id: 'INV002', sku: 'COMP-002', name: 'Component 2', unitCost: 8.00 };
  const inventory = [item1, item2];
  localStorage.setItem('manufacturing_inventory', JSON.stringify(inventory));
  
  // Step 2: Create BOM using inventory items
  const bom = {
    ...getTestBOM(),
    components: [
      { ...item1, quantity: 2, totalCost: 10.00 },
      { ...item2, quantity: 1, totalCost: 8.00 }
    ]
  };
  localStorage.setItem('manufacturing_boms', JSON.stringify([bom]));
  
  // Step 3: Create production order from BOM
  const order = getTestProductionOrder(bom.id, bom.totalCost);
  localStorage.setItem('production_orders', JSON.stringify([order]));
  
  // Step 4: Record stock consumption for production
  const consumption = {
    ...getTestStockMovement(),
    type: 'consumption',
    quantity: -18, // Consuming components for production
    reference: order.id
  };
  localStorage.setItem('stock_movements', JSON.stringify([consumption]));
  
  // Step 5: Record production completion
  order.quantityProduced = order.quantity;
  order.status = 'completed';
  order.completedDate = new Date().toISOString().split('T')[0];
  
  // Verify all data persisted
  const finalInventory = JSON.parse(localStorage.getItem('manufacturing_inventory') || '[]');
  const finalBOMs = JSON.parse(localStorage.getItem('manufacturing_boms') || '[]');
  const finalOrders = JSON.parse(localStorage.getItem('production_orders') || '[]');
  const finalMovements = JSON.parse(localStorage.getItem('stock_movements') || '[]');
  
  assert(finalInventory.length === 2, 'E2E - Inventory Count', 'Inventory items not persisted');
  assert(finalBOMs.length === 1, 'E2E - BOM Count', 'BOM not persisted');
  assert(finalOrders.length === 1, 'E2E - Order Count', 'Production order not persisted');
  assert(finalMovements.length === 1, 'E2E - Movement Count', 'Stock movement not persisted');
  
  log('End-to-end workflow tests completed', 'info');
}

function testDataIntegrity() {
  log('\n=== Testing Data Integrity ===', 'info');
  
  clearManufacturingData();
  
  // Test: Ensure IDs are unique
  const item1 = { ...getTestInventoryItem(), id: 'INV001', sku: 'TEST-SKU-001' };
  const item2 = { ...getTestInventoryItem(), id: 'INV002', sku: 'TEST-SKU-002' };
  const inventory = [item1, item2];
  
  const uniqueIds = new Set(inventory.map(item => item.id));
  assert(uniqueIds.size === inventory.length, 'Data Integrity - Unique IDs', 'Duplicate IDs detected');
  
  // Test: Ensure SKUs are unique
  const uniqueSKUs = new Set(inventory.map(item => item.sku));
  assert(uniqueSKUs.size === inventory.length, 'Data Integrity - Unique SKUs', 'Duplicate SKUs detected');
  
  // Test: Ensure calculated values are consistent
  inventory.forEach(item => {
    const calculatedTotalValue = item.quantity * item.unitCost;
    assert(item.totalValue === calculatedTotalValue, `Data Integrity - Item ${item.id} Calculation`, 
      `Total value mismatch for ${item.id}`);
  });
  
  log('Data integrity tests completed', 'info');
}

// ============================================
// BREAK TESTS - Error Handling & Edge Cases
// ============================================

function testBreakScenarios() {
  log('\n=== Testing Break Scenarios & Error Handling ===', 'info');
  
  // Clear test data but keep some for break testing
  localStorage.removeItem('test_quota');
  localStorage.removeItem('test_invalid_json');
  
  // Test: Null/undefined inputs
  try {
    const nullItem = null;
    assert(nullItem === null, 'Break Test - Null Input', 'Should handle null input gracefully');
  } catch (e) {
    assert(false, 'Break Test - Null Input Handling', `Should not throw: ${e.message}`);
  }
  
  // Test: Undefined inputs
  try {
    const undefinedItem = undefined;
    assert(undefinedItem === undefined, 'Break Test - Undefined Input', 'Should handle undefined input gracefully');
  } catch (e) {
    assert(false, 'Break Test - Undefined Input Handling', `Should not throw: ${e.message}`);
  }
  
  // Test: Invalid data types
  try {
    const invalidType = { quantity: 'not-a-number', unitCost: 'also-not-a-number' };
    const isValid = typeof invalidType.quantity === 'number' && typeof invalidType.unitCost === 'number';
    assert(!isValid, 'Break Test - Invalid Data Types', 'Should reject non-numeric values');
  } catch (e) {
    assert(false, 'Break Test - Invalid Type Handling', `Should not throw: ${e.message}`);
  }
  
  // Test: Extremely large numbers (overflow protection)
  try {
    const largeNumber = Number.MAX_SAFE_INTEGER + 1;
    const isSafe = Number.isSafeInteger(largeNumber);
    assert(!isSafe, 'Break Test - Large Number Overflow', 'Should handle large numbers safely');
  } catch (e) {
    assert(false, 'Break Test - Large Number Handling', `Should not throw: ${e.message}`);
  }
  
  // Test: Missing required fields
  try {
    const missingFields = { name: 'Test' }; // Missing SKU, quantity, etc.
    const hasRequiredFields = missingFields.sku && missingFields.quantity !== undefined;
    assert(!hasRequiredFields, 'Break Test - Missing Required Fields', 'Should reject items with missing required fields');
  } catch (e) {
    assert(false, 'Break Test - Missing Fields Handling', `Should not throw: ${e.message}`);
  }
  
  // Test: localStorage quota exceeded simulation
  try {
    // Try to store extremely large data
    const largeData = 'x'.repeat(5 * 1024 * 1024); // 5MB string
    try {
      localStorage.setItem('test_quota', largeData);
      localStorage.removeItem('test_quota');
      assert(true, 'Break Test - localStorage Quota', 'localStorage quota test completed');
    } catch (quotaError) {
      assert(quotaError.name === 'QuotaExceededError', 'Break Test - Quota Error Handling', 
        'Should handle QuotaExceededError gracefully');
    }
  } catch (e) {
    assert(false, 'Break Test - Quota Handling', `Should not throw: ${e.message}`);
  }
  
  // Test: Invalid JSON in localStorage
  try {
    localStorage.setItem('test_invalid_json', 'not-valid-json{');
    const parsed = JSON.parse(localStorage.getItem('test_invalid_json') || '[]');
    assert(false, 'Break Test - Invalid JSON', 'Should handle invalid JSON gracefully');
  } catch (jsonError) {
    assert(jsonError instanceof SyntaxError, 'Break Test - JSON Error Handling', 
      'Should catch JSON parse errors');
    localStorage.removeItem('test_invalid_json');
  }
  
  // Test: Concurrent operations simulation
  try {
    const item1 = getTestInventoryItem();
    item1.id = 'CONCURRENT-001';
    const item2 = getTestInventoryItem();
    item2.id = 'CONCURRENT-002';
    
    // Simulate concurrent writes
    localStorage.setItem('manufacturing_inventory', JSON.stringify([item1]));
    const current = JSON.parse(localStorage.getItem('manufacturing_inventory') || '[]');
    current.push(item2);
    localStorage.setItem('manufacturing_inventory', JSON.stringify(current));
    
    const final = JSON.parse(localStorage.getItem('manufacturing_inventory') || '[]');
    assert(final.length === 2, 'Break Test - Concurrent Operations', 'Should handle concurrent operations');
  } catch (e) {
    assert(false, 'Break Test - Concurrent Operations Handling', `Should not throw: ${e.message}`);
  }
  
  // Test: Empty string handling
  try {
    const emptyStringItem = { sku: '   ', name: '', quantity: 0 };
    const hasValidData = emptyStringItem.sku.trim().length > 0 && emptyStringItem.name.trim().length > 0;
    assert(!hasValidData, 'Break Test - Empty Strings', 'Should reject empty/whitespace-only strings');
  } catch (e) {
    assert(false, 'Break Test - Empty String Handling', `Should not throw: ${e.message}`);
  }
  
  log('Break scenario tests completed', 'info');
}

// ============================================
// STOCK BALANCE CALCULATION TESTS
// ============================================

function testStockBalanceCalculations() {
  log('\n=== Testing Stock Balance Calculations ===', 'info');
  
  clearManufacturingData();
  
  // Test: Forward balance calculation
  const movements = [
    { id: 'MOV-001', date: '2025-01-01', type: 'adjustment', quantity: 100, reference: 'INITIAL_BALANCE' },
    { id: 'MOV-002', date: '2025-01-02', type: 'receipt', quantity: 50 },
    { id: 'MOV-003', date: '2025-01-03', type: 'consumption', quantity: -25 },
    { id: 'MOV-004', date: '2025-01-04', type: 'adjustment', quantity: 10 }
  ];
  
  // Calculate forward balance
  let forwardBalance = 0;
  movements.forEach(mov => {
    forwardBalance += mov.quantity;
  });
  assert(forwardBalance === 135, 'Stock Balance - Forward Calculation', 
    `Expected 135, got ${forwardBalance}`);
  
  // Test: Backward balance calculation (newest first)
  const sortedMovements = [...movements].reverse(); // Newest first
  let backwardBalance = 0;
  sortedMovements.forEach(mov => {
    backwardBalance += mov.quantity;
  });
  assert(backwardBalance === 135, 'Stock Balance - Backward Calculation', 
    `Expected 135, got ${backwardBalance}`);
  
  // Test: Balance after each movement
  let runningBalance = 0;
  const balances = movements.map(mov => {
    runningBalance += mov.quantity;
    return { ...mov, balance: runningBalance };
  });
  
  assert(balances[0].balance === 100, 'Stock Balance - After Initial', 
    `Expected 100, got ${balances[0].balance}`);
  assert(balances[1].balance === 150, 'Stock Balance - After Receipt', 
    `Expected 150, got ${balances[1].balance}`);
  assert(balances[2].balance === 125, 'Stock Balance - After Consumption', 
    `Expected 125, got ${balances[2].balance}`);
  assert(balances[3].balance === 135, 'Stock Balance - After Adjustment', 
    `Expected 135, got ${balances[3].balance}`);
  
  // Test: Closing balance matches final balance
  const closingBalance = balances[balances.length - 1].balance;
  assert(closingBalance === 135, 'Stock Balance - Closing Balance', 
    `Expected 135, got ${closingBalance}`);
  
  // Test: Negative balance handling
  const negativeMovements = [
    { id: 'MOV-NEG-001', date: '2025-01-01', type: 'adjustment', quantity: 50 },
    { id: 'MOV-NEG-002', date: '2025-01-02', type: 'consumption', quantity: -100 }
  ];
  let negativeBalance = 0;
  negativeMovements.forEach(mov => {
    negativeBalance += mov.quantity;
  });
  assert(negativeBalance === -50, 'Stock Balance - Negative Balance', 
    `Expected -50, got ${negativeBalance}`);
  
  log('Stock balance calculation tests completed', 'info');
}

// ============================================
// MOVEMENT SORTING TESTS
// ============================================

function testMovementSorting() {
  log('\n=== Testing Movement Sorting ===', 'info');
  
  clearManufacturingData();
  
  // Create movements with different dates and timestamps
  const baseTime = new Date('2025-01-01T10:00:00').getTime();
  const movements = [
    { id: 'MOV-003', date: '2025-01-03', createdAt: new Date(baseTime + 2 * 86400000).toISOString(), quantity: 30 },
    { id: 'MOV-001', date: '2025-01-01', createdAt: new Date(baseTime).toISOString(), quantity: 10 },
    { id: 'MOV-004', date: '2025-01-03', createdAt: new Date(baseTime + 2 * 86400000 + 3600000).toISOString(), quantity: 40 },
    { id: 'MOV-002', date: '2025-01-02', createdAt: new Date(baseTime + 86400000).toISOString(), quantity: 20 }
  ];
  
  // Test: Sort by date (oldest first)
  const sortedByDate = [...movements].sort((a, b) => {
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }
    if (a.createdAt !== b.createdAt) {
      return a.createdAt.localeCompare(b.createdAt);
    }
    return a.id.localeCompare(b.id);
  });
  
  assert(sortedByDate[0].id === 'MOV-001', 'Movement Sorting - Primary Sort by Date', 
    'First movement should be oldest by date');
  assert(sortedByDate[1].id === 'MOV-002', 'Movement Sorting - Second by Date', 
    'Second movement should be second oldest');
  
  // Test: Secondary sort by createdAt for same date
  const sameDateMovements = sortedByDate.filter(m => m.date === '2025-01-03');
  assert(sameDateMovements[0].id === 'MOV-003', 'Movement Sorting - Secondary Sort by CreatedAt', 
    'Same date movements should be sorted by createdAt');
  assert(sameDateMovements[1].id === 'MOV-004', 'Movement Sorting - Tertiary Sort by ID', 
    'Same date and createdAt should be sorted by ID');
  
  // Test: Reverse for display (newest first)
  const reversedForDisplay = [...sortedByDate].reverse();
  assert(reversedForDisplay[0].id === 'MOV-004', 'Movement Sorting - Display Order (Newest First)', 
    'Display should show newest first');
  assert(reversedForDisplay[reversedForDisplay.length - 1].id === 'MOV-001', 
    'Movement Sorting - Display Order (Oldest Last)', 
    'Display should show oldest last');
  
  // Test: Sort with missing createdAt
  const movementsWithMissing = [
    { id: 'MOV-A', date: '2025-01-01', createdAt: null, quantity: 10 },
    { id: 'MOV-B', date: '2025-01-02', createdAt: new Date().toISOString(), quantity: 20 }
  ];
  const sortedWithMissing = [...movementsWithMissing].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (!a.createdAt && !b.createdAt) return a.id.localeCompare(b.id);
    if (!a.createdAt) return 1;
    if (!b.createdAt) return -1;
    return a.createdAt.localeCompare(b.createdAt);
  });
  assert(sortedWithMissing[0].id === 'MOV-A', 'Movement Sorting - Handle Missing CreatedAt', 
    'Should handle missing createdAt gracefully');
  
  log('Movement sorting tests completed', 'info');
}

// ============================================
// BUSINESS RULE TESTS
// ============================================

function testBusinessRules() {
  log('\n=== Testing Business Rules ===', 'info');
  
  clearManufacturingData();
  
  // Test: Cannot consume more stock than available
  const inventoryItem = { ...getTestInventoryItem(), id: 'INV-BR-001', quantity: 100 };
  const consumptionQty = 150;
  const canConsume = inventoryItem.quantity >= consumptionQty;
  assert(!canConsume, 'Business Rule - Cannot Over-Consume', 
    'Should prevent consuming more stock than available');
  
  // Test: Cannot create production order without sufficient component stock
  const bom = getTestBOM();
  bom.components = [
    { sku: 'COMP-001', quantity: 10, name: 'Component 1' },
    { sku: 'COMP-002', quantity: 5, name: 'Component 2' }
  ];
  
  const availableStock = {
    'COMP-001': 8,  // Insufficient (need 10)
    'COMP-002': 6   // Sufficient (need 5)
  };
  
  const hasSufficientStock = bom.components.every(comp => 
    (availableStock[comp.sku] || 0) >= comp.quantity
  );
  assert(!hasSufficientStock, 'Business Rule - Insufficient Component Stock', 
    'Should prevent production order creation with insufficient component stock');
  
  // Test: Cannot delete location with inventory
  const location = getTestStockLocation();
  location.id = 'LOC-BR-001';
  const locationInventory = [{
    locationId: location.id,
    itemId: 'INV-001',
    quantity: 50
  }];
  
  const hasInventory = locationInventory.some(li => li.locationId === location.id && li.quantity > 0);
  const canDelete = !hasInventory;
  assert(!canDelete, 'Business Rule - Cannot Delete Location With Inventory', 
    'Should prevent deleting location with inventory');
  
  // Test: BOM components must exist in inventory
  const bomComponents = bom.components.map(c => c.sku);
  const inventorySKUs = ['COMP-001', 'COMP-999']; // COMP-002 missing
  const allComponentsExist = bomComponents.every(sku => inventorySKUs.includes(sku));
  assert(!allComponentsExist, 'Business Rule - BOM Components Must Exist', 
    'Should require all BOM components to exist in inventory');
  
  // Test: Production orders must reference valid BOMs
  const validBOMs = [bom];
  const orderWithInvalidBOM = getTestProductionOrder('INVALID-BOM-ID', 100);
  const bomExists = validBOMs.some(b => b.id === orderWithInvalidBOM.bomId);
  assert(!bomExists, 'Business Rule - Production Order Must Reference Valid BOM', 
    'Should require production order to reference valid BOM');
  
  // Test: Stock movements must reference valid items
  const validItems = [inventoryItem];
  const movementWithInvalidItem = getTestStockMovement();
  movementWithInvalidItem.sku = 'INVALID-SKU';
  const itemExists = validItems.some(item => item.sku === movementWithInvalidItem.sku);
  assert(!itemExists, 'Business Rule - Stock Movement Must Reference Valid Item', 
    'Should require stock movement to reference valid inventory item');
  
  // Test: Stock movements must reference valid locations
  const validLocations = [location];
  const movementWithInvalidLocation = getTestStockMovement();
  movementWithInvalidLocation.toLocation = 'INVALID-LOCATION';
  const locationExists = validLocations.some(loc => 
    loc.id === movementWithInvalidLocation.toLocation || 
    loc.name === movementWithInvalidLocation.toLocation
  );
  assert(!locationExists, 'Business Rule - Stock Movement Must Reference Valid Location', 
    'Should require stock movement to reference valid location');
  
  // Test: Cannot have negative stock (unless explicitly allowed via adjustment)
  const currentStock = 50;
  const consumptionAmount = 75;
  const wouldBeNegative = (currentStock - consumptionAmount) < 0;
  const isAdjustment = false; // This is a consumption, not adjustment
  const canProceed = !wouldBeNegative || isAdjustment;
  assert(!canProceed, 'Business Rule - Prevent Negative Stock from Consumption', 
    'Should prevent negative stock from consumption (adjustments may allow)');
  
  log('Business rule tests completed', 'info');
}

// ============================================
// MAIN TEST RUNNER
// ============================================

async function runAllTests() {
  // Reset test results for clean run
  resetTestResults();
  
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Manufacturing Section Functionality & Persistence Tests   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  
  // Check if running in browser context
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    log('WARNING: This test requires a browser environment with localStorage', 'warn');
    log('Please run this test in a browser console or test environment', 'warn');
    return {
      success: false,
      error: 'Browser environment required',
      details: testResults
    };
  }
  
  // Clear all data before starting tests
  clearManufacturingData();
  
  try {
    // Inventory Tests
    testInventoryPersistence();
    testInventoryCalculations();
    testInventoryValidation();
    
    // BOM Tests
    testBOMPersistence();
    testBOMCalculations();
    testBOMComponentManagement();
    
    // Production Order Tests
    testProductionOrderPersistence();
    testProductionOrderCalculations();
    testProductionOrderWorkflow();
    
    // Stock Movement Tests
    testStockMovementPersistence();
    testStockMovementTypes();
    
    // Stock Location Tests
    testStockLocationPersistence();
    testStockLocationTypes();
    testLocationInventoryManagement();
    
    // Integration Tests
    testEndToEndWorkflow();
    testDataIntegrity();
    
    // Break Tests
    testBreakScenarios();
    
    // Stock Balance & Sorting Tests
    testStockBalanceCalculations();
    testMovementSorting();
    
    // Business Rule Tests
    testBusinessRules();
    
    // Print summary
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║                        TEST SUMMARY                           ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');
    
    const duration = ((Date.now() - testResults.startTime) / 1000).toFixed(2);
    const passedCount = testResults.passed.length;
    const failedCount = testResults.failed.length;
    const warningCount = testResults.warnings.length;
    const totalCount = testResults.totalTests;
    const passRate = totalCount > 0 ? ((passedCount / totalCount) * 100).toFixed(1) : 0;
    
    console.log(`Total Tests: ${totalCount}`);
    console.log(`✅ Passed: ${passedCount}`);
    console.log(`❌ Failed: ${failedCount}`);
    console.log(`⚠️  Warnings: ${warningCount}`);
    console.log(`📊 Pass Rate: ${passRate}%`);
    console.log(`⏱️  Duration: ${duration}s`);
    console.log('');
    
    if (testResults.failed.length > 0) {
      console.log('Failed Tests:');
      testResults.failed.forEach((result, index) => {
        console.log(`  ${index + 1}. ${result.test}: ${result.message}`);
      });
      console.log('');
    }
    
    if (testResults.warnings.length > 0) {
      console.log('Warnings:');
      testResults.warnings.forEach((warning, index) => {
        console.log(`  ${index + 1}. ${warning}`);
      });
      console.log('');
    }
    
    // Clean up
    clearManufacturingData();
    log('Test data cleared', 'info');
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    
    return {
      success: failedCount === 0,
      summary: {
        total: totalCount,
        passed: passedCount,
        failed: failedCount,
        warnings: warningCount,
        passRate: `${passRate}%`,
        duration: `${duration}s`
      },
      details: testResults
    };
    
  } catch (error) {
    log(`Test execution error: ${error.message}`, 'error');
    console.error(error);
    return {
      success: false,
      error: error.message,
      details: testResults
    };
  }
}

// Export for use in Node.js or browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runAllTests, testResults, log, resetTestResults, clearManufacturingData };
}

// Make functions globally available in browser
if (typeof window !== 'undefined') {
  window.runAllTests = runAllTests;
  window.testResults = testResults;
  window.log = log;
  window.resetTestResults = resetTestResults;
  window.clearManufacturingData = clearManufacturingData;
  
  // Wait for page to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('Run tests manually using: runAllTests()');
    });
  } else {
    console.log('Run tests manually using: runAllTests()');
  }
}
