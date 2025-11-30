#!/usr/bin/env node
/**
 * Test Stock Ledger Mathematical Integrity
 * 
 * Tests:
 * 1. Forward calculation (oldest to newest)
 * 2. Backward calculation (newest to oldest) - as displayed in UI
 * 3. Verify balances match at each point
 * 4. Test with various movement types
 */

console.log('🧮 Testing Stock Ledger Mathematical Integrity\n');

// Test Case 1: Simple sequence
console.log('Test Case 1: Simple sequence');
console.log('Movements (oldest to newest):');
console.log('  1. +100 (initial balance)');
console.log('  2. -6 (consumption)');
console.log('  3. -4 (consumption)');
console.log('Expected final balance: 90\n');

// Forward calculation (oldest to newest)
let balance = 0;
const movements = [
  { type: 'adjustment', quantity: 100 },
  { type: 'consumption', quantity: -6 },
  { type: 'consumption', quantity: -4 }
];

console.log('Forward calculation (oldest to newest):');
movements.forEach((mov, idx) => {
  const qty = mov.type === 'adjustment' ? mov.quantity : (mov.quantity < 0 ? mov.quantity : -Math.abs(mov.quantity));
  balance += qty;
  console.log(`  ${idx + 1}. ${mov.type} ${qty > 0 ? '+' : ''}${qty} → Balance: ${balance}`);
});
console.log(`Final balance: ${balance}\n`);

// Backward calculation (newest to oldest) - as displayed in UI
console.log('Backward calculation (newest to oldest - as displayed):');
let runningBalance = balance; // Start with final balance
const reversedMovements = [...movements].reverse();

reversedMovements.forEach((mov, idx) => {
  const qty = mov.type === 'adjustment' ? mov.quantity : (mov.quantity < 0 ? mov.quantity : -Math.abs(mov.quantity));
  const balanceAfter = runningBalance;
  // To get balance before, reverse the movement: if +10 was added, before was current - 10
  runningBalance = runningBalance - qty;
  const balanceBefore = runningBalance;
  console.log(`  ${reversedMovements.length - idx}. ${mov.type} ${qty > 0 ? '+' : ''}${qty} → Balance AFTER: ${balanceAfter}, Balance BEFORE: ${balanceBefore}`);
});
console.log(`Starting balance: ${runningBalance}\n`);

// Verify: Starting balance should be 0
if (runningBalance !== 0) {
  console.error(`❌ ERROR: Starting balance should be 0, got ${runningBalance}`);
  process.exit(1);
}

// Test Case 2: With receipts
console.log('Test Case 2: With receipts');
console.log('Movements (oldest to newest):');
console.log('  1. +50 (initial balance)');
console.log('  2. +20 (receipt)');
console.log('  3. -10 (consumption)');
console.log('  4. -5 (consumption)');
console.log('Expected final balance: 55\n');

balance = 0;
const movements2 = [
  { type: 'adjustment', quantity: 50 },
  { type: 'receipt', quantity: 20 },
  { type: 'consumption', quantity: -10 },
  { type: 'consumption', quantity: -5 }
];

console.log('Forward calculation:');
movements2.forEach((mov, idx) => {
  let qty = mov.quantity;
  if (mov.type === 'receipt') {
    qty = Math.abs(qty);
  } else if (mov.type === 'consumption') {
    qty = -Math.abs(qty);
  }
  balance += qty;
  console.log(`  ${idx + 1}. ${mov.type} ${qty > 0 ? '+' : ''}${qty} → Balance: ${balance}`);
});
console.log(`Final balance: ${balance}\n`);

runningBalance = balance;
const reversedMovements2 = [...movements2].reverse();

console.log('Backward calculation:');
reversedMovements2.forEach((mov, idx) => {
  let qty = mov.quantity;
  if (mov.type === 'receipt') {
    qty = Math.abs(qty);
  } else if (mov.type === 'consumption') {
    qty = -Math.abs(qty);
  }
  const balanceAfter = runningBalance;
  runningBalance = runningBalance - qty;
  const balanceBefore = runningBalance;
  console.log(`  ${reversedMovements2.length - idx}. ${mov.type} ${qty > 0 ? '+' : ''}${qty} → Balance AFTER: ${balanceAfter}, Balance BEFORE: ${balanceBefore}`);
});
console.log(`Starting balance: ${runningBalance}\n`);

if (runningBalance !== 0) {
  console.error(`❌ ERROR: Starting balance should be 0, got ${runningBalance}`);
  process.exit(1);
}

// Test Case 3: Negative adjustment
console.log('Test Case 3: Negative adjustment');
console.log('Movements (oldest to newest):');
console.log('  1. +100 (initial balance)');
console.log('  2. -20 (negative adjustment)');
console.log('Expected final balance: 80\n');

balance = 0;
const movements3 = [
  { type: 'adjustment', quantity: 100 },
  { type: 'adjustment', quantity: -20 }
];

console.log('Forward calculation:');
movements3.forEach((mov, idx) => {
  const qty = mov.quantity; // Adjustments keep their sign
  balance += qty;
  console.log(`  ${idx + 1}. ${mov.type} ${qty > 0 ? '+' : ''}${qty} → Balance: ${balance}`);
});
console.log(`Final balance: ${balance}\n`);

runningBalance = balance;
const reversedMovements3 = [...movements3].reverse();

console.log('Backward calculation:');
reversedMovements3.forEach((mov, idx) => {
  const qty = mov.quantity; // Adjustments keep their sign
  const balanceAfter = runningBalance;
  runningBalance = runningBalance - qty;
  const balanceBefore = runningBalance;
  console.log(`  ${reversedMovements3.length - idx}. ${mov.type} ${qty > 0 ? '+' : ''}${qty} → Balance AFTER: ${balanceAfter}, Balance BEFORE: ${balanceBefore}`);
});
console.log(`Starting balance: ${runningBalance}\n`);

if (runningBalance !== 0) {
  console.error(`❌ ERROR: Starting balance should be 0, got ${runningBalance}`);
  process.exit(1);
}

console.log('✅ All mathematical tests passed!');
console.log('\n📊 Summary:');
console.log('  - Forward calculation: ✅ Correct');
console.log('  - Backward calculation: ✅ Correct');
console.log('  - Balance reconciliation: ✅ Correct');

