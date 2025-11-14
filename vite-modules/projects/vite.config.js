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
          // React's hook system tracks hooks by call order and requires direct function references
          // index.html ensures React is available before loading this module, so we can safely access it
          // But we'll do a quick check and throw a clear error if React isn't available
          
          // Get React instance - should be available since index.html waits for it
          // Do a robust check with multiple attempts (non-blocking, just retries)
          function getReactInstance() {
            // Try multiple times in case of race conditions
            for (let i = 0; i < 10; i++) {
              if (typeof window !== 'undefined' && 
                  window.React && 
                  window.React !== null &&
                  typeof window.React.useState === 'function' &&
                  typeof window.React.useRef === 'function') {
                return window.React;
              }
              // Small delay between attempts (non-blocking)
              if (i < 9) {
                const start = Date.now();
                while (Date.now() - start < 5) {} // 5ms delay
              }
            }
            // If still not available, throw a clear error
            throw new Error('window.React is not available when Vite module loads. React hooks are not accessible. Please ensure React is loaded before the Vite module.');
          }
          
          const ReactInstance = getReactInstance();
          
          // Validate ReactInstance is not null before using it
          if (!ReactInstance || !ReactInstance.useState || !ReactInstance.useRef) {
            throw new Error('React instance is invalid. useState: ' + typeof ReactInstance?.useState + ', useRef: ' + typeof ReactInstance?.useRef);
          }
          
          const ReactDOMInstance = getReactDOM();
          
          // Export hooks as direct references - React's hook system requires this
          // These are captured once when the module loads, after ensuring React is available
          export const useState = ReactInstance.useState.bind(ReactInstance);
          export const useEffect = ReactInstance.useEffect.bind(ReactInstance);
          export const useRef = ReactInstance.useRef.bind(ReactInstance);
          export const useCallback = ReactInstance.useCallback.bind(ReactInstance);
          export const useMemo = ReactInstance.useMemo.bind(ReactInstance);
          export const useLayoutEffect = ReactInstance.useLayoutEffect.bind(ReactInstance);
          export const createElement = ReactInstance.createElement.bind(ReactInstance);
          export const Fragment = ReactInstance.Fragment;
          export const Component = ReactInstance.Component;
          export const PureComponent = ReactInstance.PureComponent;
          export const memo = ReactInstance.memo.bind(ReactInstance);
          export const forwardRef = ReactInstance.forwardRef.bind(ReactInstance);
          export const lazy = ReactInstance.lazy.bind(ReactInstance);
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
