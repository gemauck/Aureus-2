import { build } from 'esbuild';
import { glob } from 'glob';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔨 Building JSX files...');

// Find all JSX files in src directory
const jsxFiles = await glob('src/**/*.jsx', { cwd: __dirname });
// Also find .js files that need to be copied
const jsFiles = await glob('src/**/*.js', { cwd: __dirname, ignore: ['src/**/*.test.js', 'src/**/*.spec.js'] });

console.log(`📦 Found ${jsxFiles.length} JSX files to compile`);
console.log(`📦 Found ${jsFiles.length} JS files to copy`);

const entryPoints = jsxFiles.map(file => path.join(__dirname, file));

// Copy .js files to dist
function copyJSFile(srcPath) {
  const relativePath = path.relative(path.join(__dirname, 'src'), srcPath);
  const destPath = path.join(__dirname, 'dist', 'src', relativePath);
  const destDir = path.dirname(destPath);
  
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  
  fs.copyFileSync(srcPath, destPath);
}

try {
  await build({
    entryPoints,
    bundle: false, // Don't bundle, just transpile
    format: 'iife', // Immediately Invoked Function Expression
    outdir: 'dist/src',
    jsx: 'transform', // Use classic React.createElement() for browser
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    inject: [], // Don't inject React, assume it's global (window.React)
    loader: {
      '.jsx': 'jsx',
      '.js': 'js'
    },
    target: ['es2020'],
    minify: false, // Keep readable for debugging
    sourcemap: false,
    define: {
      'process.env.NODE_ENV': '"production"'
    }
  });

  console.log('✅ JSX files compiled successfully!');
  
  // Copy .js files to dist
  console.log('📋 Copying .js files...');
  jsFiles.forEach(file => {
    const fullPath = path.join(__dirname, file);
    copyJSFile(fullPath);
  });
  console.log(`✅ Copied ${jsFiles.length} .js files to dist/`);
  
  // Also copy hooks directory if it exists
  const hooksDir = path.join(__dirname, 'src', 'hooks');
  if (fs.existsSync(hooksDir)) {
    const hooksFiles = await glob('src/hooks/**/*.js', { cwd: __dirname });
    hooksFiles.forEach(file => {
      const fullPath = path.join(__dirname, file);
      copyJSFile(fullPath);
    });
    if (hooksFiles.length > 0) {
      console.log(`✅ Copied ${hooksFiles.length} hook files to dist/`);
    }
  }
  
  // Copy services directory if it exists
  const servicesFiles = await glob('src/services/**/*.js', { cwd: __dirname });
  if (servicesFiles.length > 0) {
    servicesFiles.forEach(file => {
      const fullPath = path.join(__dirname, file);
      copyJSFile(fullPath);
    });
    console.log(`✅ Copied ${servicesFiles.length} service files to dist/`);
  }
  
  console.log('✨ Build complete!');
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
}
