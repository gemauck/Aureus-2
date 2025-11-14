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
          // Get React dynamically - checks window.React every time it's accessed
          // This ensures React is available when hooks are actually called, not just at module load
          function getReact() {
            if (typeof window !== 'undefined' && 
                window.React && 
                window.React !== null &&
                typeof window.React.useState === 'function') {
              return window.React;
            }
            // If React isn't available, wait a bit and try again
            // This handles cases where React loads after the module
            let attempts = 0;
            const maxAttempts = 100; // 1 second max wait
            while (attempts < maxAttempts) {
              if (typeof window !== 'undefined' && 
                  window.React && 
                  window.React !== null &&
                  typeof window.React.useState === 'function') {
                return window.React;
              }
              // Busy wait 10ms
              const waitStart = Date.now();
              while (Date.now() - waitStart < 10) {}
              attempts++;
            }
            throw new Error('window.React is not available. Make sure React is loaded before using this module.');
          }
          
          function getReactDOM() {
            if (typeof window !== 'undefined' && window.ReactDOM && window.ReactDOM !== null) {
              return window.ReactDOM;
            }
            return null;
          }
          
          // Create a Proxy for React that accesses window.React dynamically
          // This ensures React is always available when hooks are called
          const ReactProxy = new Proxy({}, {
            get(target, prop) {
              const react = getReact();
              const value = react[prop];
              // For functions (hooks, createElement, etc.), bind them to React
              // This ensures they work correctly with React's internal system
              return typeof value === 'function' ? value.bind(react) : value;
            }
          });
          
          // Export the Proxy as default React
          export default ReactProxy;
          
          // Export hooks - they'll access React dynamically through the Proxy
          // But we need to export them as direct references for React's hook system
          // So we'll create getters that access React at call time
          const ReactGetter = () => getReact();
          
          // CRITICAL: React hooks cannot be wrapped - they must be direct references
          // So we get React once and export hooks directly, but ensure React is available
          // The Proxy approach for default export ensures React is accessed dynamically
          // For named exports of hooks, we need direct references but accessed through Proxy
          
          // Wait for React to be definitely available before exporting hooks
          const ReactInstance = getReact();
          const ReactDOMInstance = getReactDOM();
          
          // Export hooks as direct references - React's hook system requires this
          // But we access them through getReact() to ensure React is available
          // Note: These will be evaluated once, so React must be available at module load
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
          export const React = ReactProxy;
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
