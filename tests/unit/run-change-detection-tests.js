#!/usr/bin/env node
/**
 * Change Detection Test Runner
 * 
 * Runs all unit tests that verify changes don't break existing functionality.
 * Use this before committing changes to ensure no regressions.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '../..');

console.log('🧪 Running Change Detection Tests\n');
console.log('='.repeat(60));
console.log('These tests verify that changes don\'t break existing functionality');
console.log('='.repeat(60));
console.log();

const testFiles = [
  'tests/unit/api/clients/change-detection.test.js',
  'tests/unit/api/contacts/change-detection.test.js',
  'tests/unit/api/_lib/duplicateValidation.test.js'
];

const child = spawn('npm', ['test', '--', ...testFiles], {
  stdio: 'inherit',
  shell: true,
  cwd: rootDir
});

child.on('close', (code) => {
  console.log();
  console.log('='.repeat(60));
  
  if (code === 0) {
    console.log('✅ All change detection tests passed!');
    console.log('✨ Your changes are safe to commit.');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed!');
    console.log('⚠️  Please fix the issues before committing.');
    console.log();
    console.log('Common fixes:');
    console.log('  1. Update tests if behavior intentionally changed');
    console.log('  2. Fix code if tests reveal actual bugs');
    console.log('  3. Check mock setup if tests fail unexpectedly');
    process.exit(1);
  }
});

child.on('error', (error) => {
  console.error('❌ Error running tests:', error.message);
  process.exit(1);
});

