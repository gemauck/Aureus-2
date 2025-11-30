#!/usr/bin/env node
/**
 * Test Stock Ledger Balance Calculation
 * 
 * Verify the backward calculation logic for stock ledger display
 */

console.log('🧮 Testing Stock Ledger Balance Calculation\n');

// Test Case: Movements (oldest to newest)
// 1. +100 (initial balance)
// 2. -6 (consumption)
// 3. -4 (consumption)
// 4. +10 (adjustment)
// Expected final balance: 100

const movements = [
  { type: 'adjustment', quantity: 100, name: 'Initial Balance' },
  { type: 'consumption', quantity: -6, name: 'Consumption WO0002' },
  { type: 'consumption', quantity: -4, name: 'Consumption WO0003' },
  { type: 'adjustment', quantity: 10, name: 'Adjustment TEST-ADJ-001' }
];

console.log('Movements (oldest to newest):');
movements.forEach((mov, idx) => {
  console.log(`  ${idx + 1}. ${mov.type} ${mov.quantity > 0 ? '+' : ''}${mov.quantity} - ${mov.name}`);
});

// Forward calculation
console.log('\n📈 Forward Calculation (oldest to newest):');
let balance = 0;
movements.forEach((mov, idx) => {
  let qty = mov.quantity;
  if (mov.type === 'receipt') {
    qty = Math.abs(qty);
  } else if (mov.type === 'consumption' || mov.type === 'production' || mov.type === 'sale') {
    qty = -Math.abs(qty);
  }
  balance += qty;
  console.log(`  ${idx + 1}. ${mov.type} ${qty > 0 ? '+' : ''}${qty} → Balance: ${balance}`);
});
console.log(`  Final Balance: ${balance}\n`);

// Backward calculation (as displayed in UI - newest first)
console.log('📉 Backward Calculation (newest to oldest - as displayed in UI):');
const reversedMovements = [...movements].reverse();
let runningBalance = balance; // Start with final balance

console.log('  (Displaying balance AFTER each movement)');
reversedMovements.forEach((mov, idx) => {
  let qty = mov.quantity;
  if (mov.type === 'receipt') {
    qty = Math.abs(qty);
  } else if (mov.type === 'consumption' || mov.type === 'production' || mov.type === 'sale') {
    qty = -Math.abs(qty);
  }
  
  const balanceAfter = runningBalance; // This is what we display
  // To get balance before this movement, we reverse the effect
  // If movement was +10, balance before was current - 10
  // If movement was -6, balance before was current + 6
  runningBalance = runningBalance - qty; // Reverse the movement
  
  console.log(`  ${reversedMovements.length - idx}. ${mov.type} ${qty > 0 ? '+' : ''}${qty} → Balance AFTER: ${balanceAfter} (Balance BEFORE: ${runningBalance})`);
});
console.log(`  Starting Balance: ${runningBalance}\n`);

// Expected balances (after each movement, in chronological order)
console.log('✅ Expected Balances (after each movement, chronological order):');
let expectedBalance = 0;
movements.forEach((mov, idx) => {
  let qty = mov.quantity;
  if (mov.type === 'receipt') {
    qty = Math.abs(qty);
  } else if (mov.type === 'consumption' || mov.type === 'production' || mov.type === 'sale') {
    qty = -Math.abs(qty);
  }
  expectedBalance += qty;
  console.log(`  After ${mov.name}: ${expectedBalance}`);
});

// Expected balances when displayed (newest first)
console.log('\n✅ Expected Balances (when displayed newest-first):');
const expectedBalances = [];
let tempBalance = 0;
movements.forEach((mov) => {
  let qty = mov.quantity;
  if (mov.type === 'receipt') {
    qty = Math.abs(qty);
  } else if (mov.type === 'consumption' || mov.type === 'production' || mov.type === 'sale') {
    qty = -Math.abs(qty);
  }
  tempBalance += qty;
  expectedBalances.push(tempBalance);
});

reversedMovements.forEach((mov, idx) => {
  const originalIdx = movements.length - 1 - idx;
  const expected = expectedBalances[originalIdx];
  console.log(`  ${reversedMovements.length - idx}. ${mov.name}: ${expected}`);
});

console.log('\n📊 Summary:');
console.log('  The backward calculation should show:');
console.log('    1. +10 adjustment → Balance: 100 ✅');
console.log('    2. +100 initial → Balance: 90 ✅');
console.log('    3. -6 consumption → Balance: 94 ❌ (currently showing -10)');
console.log('    4. -4 consumption → Balance: 80 ❌ (currently showing -4)');

