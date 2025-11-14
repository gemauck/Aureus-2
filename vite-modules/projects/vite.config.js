import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Plugin to replace React imports with window.React at build time
const reactWindowPlugin = () => {
  return {
    name: 'react-window-plugin',
    resolveId(id) {
      // Intercept React and react-dom imports
      if (id === 'react' || id === 'react-dom' || id === 'react/jsx-runtime') {
        // Return a virtual module that uses window.React
        return '\0virtual:react-window';
      }
      return null;
    },
    load(id) {
      // Provide the virtual module
      if (id === '\0virtual:react-window') {
        return `
          // Wait for React to be available before exporting anything
          // This is critical - React must be available when exports are evaluated
          function waitForReact(maxWait = 5000) {
            const start = Date.now();
            while (Date.now() - start < maxWait) {
              if (typeof window !== 'undefined' && 
                  window.React && 
                  window.React !== null &&
                  typeof window.React.useState === 'function') {
                return window.React;
              }
              // Busy wait 10ms
              const waitStart = Date.now();
              while (Date.now() - waitStart < 10) {}
            }
            throw new Error('window.React is not available after waiting ' + maxWait + 'ms. Make sure React is loaded before this module.');
          }
          
          // Get React immediately - wait if needed
          const ReactInstance = waitForReact();
          const ReactDOMInstance = (typeof window !== 'undefined' && window.ReactDOM && window.ReactDOM !== null) 
            ? window.ReactDOM 
            : null;
          
          // Export React directly - it's now guaranteed to be available
          export default ReactInstance;
          
          // Export all React APIs directly from the instance
          // These are the actual React functions, not proxies
          export const useState = ReactInstance.useState;
          export const useEffect = ReactInstance.useEffect;
          export const useRef = ReactInstance.useRef;
          export const useCallback = ReactInstance.useCallback;
          export const useMemo = ReactInstance.useMemo;
          export const useLayoutEffect = ReactInstance.useLayoutEffect;
          export const createElement = ReactInstance.createElement;
          export const Fragment = ReactInstance.Fragment;
          export const Component = ReactInstance.Component;
          export const PureComponent = ReactInstance.PureComponent;
          export const memo = ReactInstance.memo;
          export const forwardRef = ReactInstance.forwardRef;
          export const lazy = ReactInstance.lazy;
          export const Suspense = ReactInstance.Suspense;
          export const StrictMode = ReactInstance.StrictMode;
          export const React = ReactInstance;
          export const ReactDOM = ReactDOMInstance;
        `;
      }
      return null;
    }
  };
};

export default defineConfig({
  plugins: [
    react({
      jsxRuntime: 'classic', // Use classic JSX runtime (React.createElement)
      jsxImportSource: undefined, // Don't use automatic JSX runtime
    }),
    reactWindowPlugin()
  ],
  
  server: {
    port: 3001,  // Different port from main app
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  
  build: {
    outDir: '../../dist/vite-projects',  // Separate output
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Single file for easy inclusion
        entryFileNames: 'projects-module.js',
        chunkFileNames: 'projects-[name].js',
        assetFileNames: 'projects-[name].[ext]'
      }
    }
  },
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  
  define: {
    // Replace React imports with window.React at build time
    'import.meta.env.REACT_FROM_WINDOW': 'true',
  },
});
