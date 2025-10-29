#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const config = {
    srcDir: 'src', // Changed from 'components' to 'src'
    outDir: 'dist/src',
    presets: ['@babel/preset-react'],
    verbose: true
};

// Color output helpers
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    yellow: '\x1b[33m',
    red: '\x1b[31m'
};

function log(msg, color = 'reset') {
    console.log(`${colors[color]}${msg}${colors.reset}`);
}

// Ensure output directory exists
function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

// Get all JSX/JS files recursively
function getAllFiles(dir, fileList = []) {
    if (!fs.existsSync(dir)) {
        log(`⚠️  Source directory not found: ${dir}`, 'yellow');
        return fileList;
    }

    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
            getAllFiles(filePath, fileList);
        } else if (file.endsWith('.jsx') || file.endsWith('.js')) {
            fileList.push(filePath);
        }
    });
    return fileList;
}

// Transform a single file
function transformFile(file) {
    try {
        const code = fs.readFileSync(file, 'utf8');
        
        const result = babel.transformSync(code, {
            presets: config.presets,
            filename: file,
            sourceMaps: false,
            comments: false
        });
        
        // Calculate output path
        const relativePath = path.relative(config.srcDir, file);
        const outPath = path.join(config.outDir, relativePath.replace('.jsx', '.js'));
        const outDirPath = path.dirname(outPath);
        
        // Ensure output directory exists
        ensureDir(outDirPath);
        
        // Write compiled file
        fs.writeFileSync(outPath, result.code);
        
        if (config.verbose) {
            const originalSize = (code.length / 1024).toFixed(1);
            const compiledSize = (result.code.length / 1024).toFixed(1);
            log(`  ✅ ${relativePath} (${originalSize}KB → ${compiledSize}KB)`, 'green');
        }
        
        return { success: true, file };
    } catch (error) {
        log(`  ❌ ${file}: ${error.message}`, 'red');
        return { success: false, file, error };
    }
}

// Main build function
function build() {
    const startTime = Date.now();
    
    log('\n🚀 Starting JSX compilation...', 'blue');
    log(`   Source: ${config.srcDir}`, 'blue');
    log(`   Output: ${config.outDir}\n`, 'blue');
    
    // Ensure output directory exists
    ensureDir(config.outDir);
    
    // Get all files
    const files = getAllFiles(config.srcDir);
    
    if (files.length === 0) {
        log('⚠️  No JSX/JS files found to compile', 'yellow');
        return;
    }
    
    log(`📦 Found ${files.length} files to compile\n`, 'blue');
    
    // Transform all files
    const results = files.map(transformFile);
    
    // Summary
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    log('\n' + '='.repeat(50), 'blue');
    log(`✨ Build complete in ${duration}s`, 'green');
    log(`   Success: ${successful} files`, 'green');
    if (failed > 0) {
        log(`   Failed: ${failed} files`, 'red');
    }
    log('='.repeat(50) + '\n', 'blue');
    
    if (failed > 0) {
        process.exit(1);
    }
}

// Watch mode
function watch() {
    log('\n👀 Starting watch mode...', 'blue');
    log('   Press Ctrl+C to stop\n', 'blue');
    
    // Initial build
    build();
    
    // Watch for changes
    const chokidar = require('chokidar');
    
    const watcher = chokidar.watch(config.srcDir, {
        ignored: /(^|[\/\\])\../, // ignore dotfiles
        persistent: true,
        ignoreInitial: true
    });
    
    watcher
        .on('change', (filePath) => {
            if (filePath.endsWith('.jsx') || filePath.endsWith('.js')) {
                log(`\n📝 File changed: ${filePath}`, 'yellow');
                transformFile(filePath);
            }
        })
        .on('add', (filePath) => {
            if (filePath.endsWith('.jsx') || filePath.endsWith('.js')) {
                log(`\n➕ File added: ${filePath}`, 'yellow');
                transformFile(filePath);
            }
        })
        .on('unlink', (filePath) => {
            if (filePath.endsWith('.jsx') || filePath.endsWith('.js')) {
                log(`\n🗑️  File removed: ${filePath}`, 'yellow');
                const relativePath = path.relative(config.srcDir, filePath);
                const outPath = path.join(config.outDir, relativePath.replace('.jsx', '.js'));
                if (fs.existsSync(outPath)) {
                    fs.unlinkSync(outPath);
                    log(`   Deleted compiled file: ${outPath}`, 'yellow');
                }
            }
        });
}

// Clean dist directory
function clean() {
    log('\n🧹 Cleaning dist directory...', 'blue');
    if (fs.existsSync(config.outDir)) {
        fs.rmSync(config.outDir, { recursive: true, force: true });
        log(`   ✅ Removed ${config.outDir}`, 'green');
    }
    log('');
}

// CLI
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
    case 'watch':
        watch();
        break;
    case 'clean':
        clean();
        break;
    case 'build':
    default:
        build();
        break;
}
