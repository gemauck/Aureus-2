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
          // Lazy getter for React - waits for window.React to be available
          // This handles the case where the module loads before React is fully ready
          const getReact = () => {
            if (typeof window !== 'undefined' && window.React) {
              return window.React;
            }
            // If React isn't available yet, wait a bit and try again
            // This handles race conditions where module loads before React script completes
            let attempts = 0;
            const maxAttempts = 50; // 5 seconds max wait
            while (attempts < maxAttempts) {
              if (typeof window !== 'undefined' && window.React) {
                return window.React;
              }
              // Synchronous wait (blocks, but only briefly)
              const start = Date.now();
              while (Date.now() - start < 100) {
                // Busy wait 100ms
              }
              attempts++;
            }
            throw new Error('window.React is not available after waiting. Make sure React is loaded before this module.');
          };
          
          const getReactDOM = () => {
            if (typeof window !== 'undefined' && window.ReactDOM) {
              return window.ReactDOM;
            }
            return null;
          };
          
          // Create a lazy React object using Proxy
          // This ensures window.React is accessed at runtime, not at module evaluation time
          const createLazyReact = () => {
            return new Proxy({}, {
              get(target, prop) {
                const react = getReact();
                const value = react[prop];
                // For functions (hooks, createElement, etc.), return them directly
                // React's hook system needs direct access to the actual functions
                return typeof value === 'function' ? value.bind(react) : value;
              }
            });
          };
          
          // Get React once at module load - wait for it if needed
          // This ensures React is available for all exports
          const ReactInstance = getReact();
          const ReactDOMInstance = getReactDOM();
          
          // Export React directly - it's now guaranteed to be available
          export default ReactInstance;
          
          // Export all React APIs directly from the instance
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
