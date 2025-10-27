import { build } from 'esbuild';
import { glob } from 'glob';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔨 Building JSX files...');

// Find all JSX files in src directory
const jsxFiles = await glob('src/**/*.jsx', { cwd: __dirname });

console.log(`📦 Found ${jsxFiles.length} JSX files to compile`);

const entryPoints = jsxFiles.map(file => path.join(__dirname, file));

try {
  await build({
    entryPoints,
    bundle: false, // Don't bundle, just transpile
    format: 'iife', // Immediately Invoked Function Expression
    outdir: 'dist/src',
    jsx: 'automatic', // Use React 17+ JSX transform
    loader: {
      '.jsx': 'jsx',
      '.js': 'js'
    },
    target: ['es2020'],
    minify: false, // Keep readable for debugging
    sourcemap: false
  });

  console.log('✅ JSX files compiled successfully!');
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
}
