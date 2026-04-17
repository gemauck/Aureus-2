#!/usr/bin/env node
/**
 * Smoke test: Job Cards persistence paths and Service & Maintenance offline shell.
 * (Legacy localStorage/sync string checks were removed — JobCards classic manager now uses DatabaseAPI only.)
 * Run: node test-jobcard-offline-sync.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testResults = { passed: 0, failed: 0, errors: [] };

function test(name, condition, errorMessage) {
  if (condition) {
    console.log(`✅ ${name}`);
    testResults.passed++;
  } else {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${errorMessage}`);
    testResults.failed++;
    testResults.errors.push({ test: name, error: errorMessage });
  }
}

console.log('🧪 Job Cards / Service & Maintenance smoke (source checks)\n');

// DatabaseAPI job card methods
try {
  const dbApiPath = path.join(__dirname, 'src/utils/databaseAPI.js');
  const dbApiCode = fs.readFileSync(dbApiPath, 'utf8');
  test('databaseAPI: getJobCards', dbApiCode.includes('getJobCards'), 'missing getJobCards');
  test('databaseAPI: createJobCard', dbApiCode.includes('createJobCard'), 'missing createJobCard');
  test('databaseAPI: updateJobCard', dbApiCode.includes('updateJobCard'), 'missing updateJobCard');
  test('databaseAPI: deleteJobCard', dbApiCode.includes('deleteJobCard'), 'missing deleteJobCard');
} catch (e) {
  console.error('❌ Could not read databaseAPI.js:', e.message);
  process.exit(1);
}

// JobCards.jsx classic manager uses API
try {
  const jcPath = path.join(__dirname, 'src/components/manufacturing/JobCards.jsx');
  const jc = fs.readFileSync(jcPath, 'utf8');
  test('JobCards: save uses DatabaseAPI.createJobCard / updateJobCard', jc.includes('DatabaseAPI') && jc.includes('createJobCard') && jc.includes('updateJobCard'), 'expected DatabaseAPI create/update');
  test('JobCards: delete uses DatabaseAPI.deleteJobCard', jc.includes('deleteJobCard'), 'missing deleteJobCard call');
  test('JobCards: registers window.JobCards', jc.includes('window.JobCards') && jc.includes('openNewJobCardModal'), 'missing global registration');
} catch (e) {
  console.error('❌ Could not read JobCards.jsx:', e.message);
  process.exit(1);
}

// Service & Maintenance: online/offline indicator
try {
  const smPath = path.join(__dirname, 'src/components/service-maintenance/ServiceAndMaintenance.jsx');
  const sm = fs.readFileSync(smPath, 'utf8');
  test('ServiceAndMaintenance: online/offline listeners', sm.includes("addEventListener('online'") && sm.includes("addEventListener('offline'"), 'missing online/offline listeners');
  test('ServiceAndMaintenance: exposes window.ServiceAndMaintenance', sm.includes('window.ServiceAndMaintenance'), 'missing window export');
} catch (e) {
  console.error('❌ Could not read ServiceAndMaintenance.jsx:', e.message);
  process.exit(1);
}

// Optional: compiled bundle exists in dist (CI may not have run build)
const distPath = path.join(__dirname, 'dist/src/components/manufacturing/JobCards.js');
if (fs.existsSync(distPath)) {
  const compiled = fs.readFileSync(distPath, 'utf8');
  test('dist JobCards.js: DatabaseAPI referenced', compiled.includes('DatabaseAPI'), 'compiled bundle missing DatabaseAPI');
} else {
  console.log('⚠️  dist JobCards.js not found (run npm run build:jsx) — skipping dist check');
}

console.log('\n' + '='.repeat(50));
console.log(`✅ Passed: ${testResults.passed}`);
console.log(`❌ Failed: ${testResults.failed}`);

if (testResults.failed > 0) {
  testResults.errors.forEach((err, idx) => {
    console.log(`${idx + 1}. ${err.test}: ${err.error}`);
  });
  process.exit(1);
}
console.log('\n🎉 Smoke checks passed.');
process.exit(0);
