#!/usr/bin/env node
/**
 * Update cache-busting versions in index.html during deployment
 * This ensures browsers fetch fresh assets after each deployment
 */

import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { execSync } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..')
const indexHtmlPath = join(rootDir, 'index.html')

// Generate a new version string based on git commit hash or timestamp
function getDeploymentVersion() {
  try {
    // Try to get git commit hash (short, 7 chars)
    const gitHash = execSync('git rev-parse --short HEAD', { 
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
    
    // Get current date in YYYYMMDD format
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '')
    
    // Return: YYYYMMDD-gitHash
    return `${date}-${gitHash}`
  } catch (error) {
    // Fallback to timestamp if git is not available
    const timestamp = Date.now()
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '')
    return `${date}-${timestamp}`
  }
}

// Generate build version (timestamp for BUILD_VERSION)
function getBuildVersion() {
  return Date.now().toString()
}

// Update cache-busting versions in index.html
function updateCacheVersions() {
  console.log('🔄 Updating cache-busting versions in index.html...')
  
  let html = readFileSync(indexHtmlPath, 'utf8')
  const deploymentVersion = getDeploymentVersion()
  const buildVersion = getBuildVersion()
  
  // Update APP_VERSION in cache clearing script
  const appVersionPattern = /var APP_VERSION = '[^']+'/
  const newAppVersion = `var APP_VERSION = '${deploymentVersion}'`
  if (appVersionPattern.test(html)) {
    html = html.replace(appVersionPattern, newAppVersion)
    console.log(`✅ Updated APP_VERSION to: ${deploymentVersion}`)
  } else {
    console.warn('⚠️  APP_VERSION pattern not found in index.html')
  }
  
  // Update BUILD_VERSION
  const buildVersionPattern = /window\.BUILD_VERSION = '[^']+'/
  const newBuildVersion = `window.BUILD_VERSION = '${buildVersion}'`
  if (buildVersionPattern.test(html)) {
    html = html.replace(buildVersionPattern, newBuildVersion)
    console.log(`✅ Updated BUILD_VERSION to: ${buildVersion}`)
  } else {
    console.warn('⚠️  BUILD_VERSION pattern not found in index.html')
  }
  
  // Update all cache-busting query parameters
  // Pattern: ?v=YYYYMMDD-* or ?v=* (any version string)
  const cacheBustPattern = /(\?v=)[^"'\s]+/g
  const matches = html.match(cacheBustPattern)
  
  if (matches) {
    matches.forEach(match => {
      const newVersion = match.split('=')[0] + '=' + deploymentVersion
      html = html.replace(match, newVersion)
    })
    console.log(`✅ Updated ${matches.length} cache-busting query parameters`)
  }
  
  // Update VITE_PROJECTS_VERSION
  const viteProjectsPattern = /const VITE_PROJECTS_VERSION = '[^']+'/
  const newViteProjectsVersion = `const VITE_PROJECTS_VERSION = '${deploymentVersion}'`
  if (viteProjectsPattern.test(html)) {
    html = html.replace(viteProjectsPattern, newViteProjectsVersion)
    console.log(`✅ Updated VITE_PROJECTS_VERSION to: ${deploymentVersion}`)
  }
  
  // Write updated HTML
  writeFileSync(indexHtmlPath, html, 'utf8')
  console.log('✅ Cache versions updated successfully!')
  console.log(`📦 Deployment version: ${deploymentVersion}`)
  console.log(`📦 Build version: ${buildVersion}`)
  
  return { deploymentVersion, buildVersion }
}

// Run the update
try {
  const versions = updateCacheVersions()
  
  // Export versions for use in deployment script
  console.log('\n📋 Version info for deployment:')
  console.log(`export APP_VERSION="${versions.deploymentVersion}"`)
  console.log(`export APP_BUILD_TIME="${new Date().toISOString()}"`)
  
  process.exit(0)
} catch (error) {
  console.error('❌ Error updating cache versions:', error)
  process.exit(1)
}








