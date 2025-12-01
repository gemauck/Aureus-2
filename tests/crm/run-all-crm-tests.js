#!/usr/bin/env node
/**
 * CRM Test Suite Runner
 * Runs all CRM tests: break, persistence, functionality, and business logic
 */

import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const testSuites = [
  { name: 'Break Tests', file: 'crm-break-tests.js' },
  { name: 'Persistence Tests', file: 'crm-persistence-tests.js' },
  { name: 'Functionality Tests', file: 'crm-functionality-tests.js' },
  { name: 'Business Logic Tests', file: 'crm-business-logic-tests.js' }
]

const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  suites: []
}

function runTestSuite(suite) {
  return new Promise((resolve) => {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`🧪 Running ${suite.name}`)
    console.log('='.repeat(60))
    
    const testFile = join(__dirname, suite.file)
    // Use absolute path and quote it properly for paths with spaces
    const child = spawn('node', [testFile], {
      stdio: 'inherit',
      shell: false,
      cwd: __dirname
    })
    
    child.on('close', (code) => {
      const passed = code === 0
      results.suites.push({
        name: suite.name,
        passed,
        exitCode: code
      })
      
      if (passed) {
        results.passed++
        console.log(`\n✅ ${suite.name} completed successfully`)
      } else {
        results.failed++
        console.log(`\n❌ ${suite.name} failed with exit code ${code}`)
      }
      
      resolve(passed)
    })
    
    child.on('error', (error) => {
      console.error(`\n❌ Error running ${suite.name}:`, error.message)
      results.failed++
      results.suites.push({
        name: suite.name,
        passed: false,
        error: error.message
      })
      resolve(false)
    })
  })
}

async function runAllSuites() {
  console.log('🚀 Starting CRM Test Suite')
  console.log(`📅 ${new Date().toISOString()}`)
  console.log(`📦 Running ${testSuites.length} test suites\n`)
  
  const startTime = Date.now()
  
  // Run tests sequentially
  for (const suite of testSuites) {
    await runTestSuite(suite)
    // Small delay between suites
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(2)
  
  // Print final summary
  console.log('\n' + '='.repeat(60))
  console.log('📊 Final Test Summary')
  console.log('='.repeat(60))
  console.log(`✅ Passed Suites: ${results.passed}`)
  console.log(`❌ Failed Suites: ${results.failed}`)
  console.log(`⏱️  Total Duration: ${duration}s`)
  
  console.log('\n📋 Suite Results:')
  results.suites.forEach((suite, i) => {
    const status = suite.passed ? '✅' : '❌'
    console.log(`   ${i + 1}. ${status} ${suite.name}`)
    if (suite.error) {
      console.log(`      Error: ${suite.error}`)
    }
  })
  
  const successRate = ((results.passed / testSuites.length) * 100).toFixed(1)
  console.log(`\n🎯 Success Rate: ${successRate}%`)
  
  if (results.failed === 0) {
    console.log('\n🎉 All test suites passed!')
    process.exit(0)
  } else {
    console.log('\n⚠️  Some test suites failed. Review the output above.')
    process.exit(1)
  }
}

// Run all test suites
runAllSuites().catch(error => {
  console.error('\n❌ Fatal error:', error)
  process.exit(1)
})

