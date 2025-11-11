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

// Copy .js files to dist and wrap ES6 exports for browser
function copyJSFile(srcPath) {
  const relativePath = path.relative(path.join(__dirname, 'src'), srcPath);
  const destPath = path.join(__dirname, 'dist', 'src', relativePath);
  const destDir = path.dirname(destPath);
  
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  
  // Read the file content
  let content = fs.readFileSync(srcPath, 'utf8');
  
  // Check if file uses ES6 exports
  if (content.includes('export ')) {
    // Collect all exports to expose to window
    const exportsToExpose = [];
    
    // Match export const, export function, export class, export default
    const patterns = [
      /export\s+const\s+(\w+)/g,
      /export\s+function\s+(\w+)/g,
      /export\s+class\s+(\w+)/g,
      /export\s+default\s+(?:function\s+)?(\w+)/g,
      /export\s+default\s+(\w+)/g
    ];
    
    patterns.forEach(pattern => {
      const matches = [...content.matchAll(pattern)];
      matches.forEach(match => {
        if (match[1] && !exportsToExpose.includes(match[1])) {
          exportsToExpose.push(match[1]);
        }
      });
    });
    
    // Replace export statements
    content = content.replace(/export\s+const\s+/g, 'const ');
    content = content.replace(/export\s+function\s+/g, 'function ');
    content = content.replace(/export\s+class\s+/g, 'class ');
    content = content.replace(/export\s+default\s+function\s+(\w+)/g, 'function $1');
    content = content.replace(/export\s+default\s+class\s+(\w+)/g, 'class $1');
    // Handle export default identifier (but not function/class)
    // Special case: export default window.GoogleCalendarService - just comment it out
    content = content.replace(/export\s+default\s+window\.\w+;?/g, '// Already exported to window');
    
    // Only process other export defaults if we haven't already handled them
    if (!content.includes('// Already exported to window')) {
      // Skip if it's already window.something
      content = content.replace(/export\s+default\s+(?!window\.)(\w+);/g, 'const defaultExport = $1;');
      content = content.replace(/export\s+default\s+(?!window\.)([^;]+);/g, 'const defaultExport = $1;');
    }
    
    // Wrap in IIFE and expose to window
    if (exportsToExpose.length > 0 || content.includes('defaultExport')) {
      let exposeStatements = '';
      if (exportsToExpose.length > 0) {
        exposeStatements = exportsToExpose.map(exp => `window.${exp} = ${exp};`).join('\n');
      }
      if (content.includes('defaultExport')) {
        exposeStatements += '\nif (typeof defaultExport !== "undefined") { window.GoogleCalendarService = defaultExport; }';
      }
      content = `(() => {\n${content}\n\n// Expose to window\n${exposeStatements}\n})();`;
      // Clean up any duplicate window.window assignments
      content = content.replace(/window\.window\s*=\s*window[;\n]*/g, '');
    } else {
      content = `(() => {\n${content}\n})();`;
      // Clean up any duplicate window.window assignments
      content = content.replace(/window\.window\s*=\s*window[;\n]*/g, '');
    }
  }
  
  fs.writeFileSync(destPath, content, 'utf8');
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
    minify: process.env.NODE_ENV === 'production', // Minify in production for smaller bundles
    sourcemap: false,
    define: {
      'process.env.NODE_ENV': `"${process.env.NODE_ENV || 'production'}"`
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

  // Build core bundle to reduce initial script requests
  const coreEntryPath = path.join(__dirname, 'src', 'core-entry.js');
  if (fs.existsSync(coreEntryPath)) {
    console.log('🔗 Building core bundle...');
    await build({
      entryPoints: [coreEntryPath],
      bundle: true,
      format: 'iife',
      outfile: path.join(__dirname, 'dist', 'core-bundle.js'),
      jsx: 'transform',
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
      target: ['es2020'],
      minify: process.env.NODE_ENV === 'production',
      sourcemap: false,
      define: {
        'process.env.NODE_ENV': `"${process.env.NODE_ENV || 'production'}"`
      }
    });
    console.log('✅ Core bundle built at dist/core-bundle.js');
  } else {
    console.warn('⚠️ core-entry.js not found, skipping core bundle build');
  }
  
  console.log('✨ Build complete!');
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
}
