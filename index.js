#!/usr/bin/env node

// Railway entry point - redirects to Railway server
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚂 Railway ERP Starting...');
console.log('📁 Working directory:', __dirname);

// Start the Railway server
const serverPath = path.join(__dirname, 'server', 'railway.js');
console.log('🔧 Starting server:', serverPath);

const server = spawn('node', [serverPath], {
  stdio: 'inherit',
  cwd: __dirname
});

server.on('error', (error) => {
  console.error('❌ Server error:', error);
  process.exit(1);
});

server.on('exit', (code) => {
  console.log(`🛑 Server exited with code ${code}`);
  process.exit(code);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Railway shutting down...');
  server.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('🛑 Railway shutting down...');
  server.kill('SIGINT');
});
