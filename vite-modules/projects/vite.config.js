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
          // COMPREHENSIVE FIX: Ensure React is available and export hooks correctly
          // This module replaces 'react' imports with window.React access
          
          // Wait for React to be fully available with all required hooks
          // index.html ensures React loads before this module, but we validate anyway
          function ensureReactAvailable() {
            const requiredHooks = ['useState', 'useEffect', 'useRef', 'useCallback', 'useMemo'];
            const maxAttempts = 20; // 200ms total (20 * 10ms)
            
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
              if (typeof window !== 'undefined' && 
                  window.React && 
                  window.React !== null &&
                  typeof window.React.useState === 'function' &&
                  typeof window.React.useEffect === 'function' &&
                  typeof window.React.useRef === 'function') {
                // Verify all required hooks exist
                const allHooksPresent = requiredHooks.every(hook => 
                  typeof window.React[hook] === 'function'
                );
                
                if (allHooksPresent) {
                  return window.React;
                }
              }
              
              // Small non-blocking delay between attempts
              if (attempt < maxAttempts - 1) {
                const start = Date.now();
                while (Date.now() - start < 10) {} // 10ms delay
              }
            }
            
            // If we get here, React is not available
            const errorMsg = 'window.React is not available when Vite module loads. ' +
              'Required hooks: ' + requiredHooks.join(', ') + '. ' +
              'React available: ' + (typeof window !== 'undefined' && window.React ? 'yes' : 'no') + '. ' +
              'Please ensure React is loaded before the Vite module.';
            throw new Error(errorMsg);
          }
          
          // Get React instance - this will throw if React is not available
          const ReactInstance = ensureReactAvailable();
          
          // Final validation - ensure ReactInstance is valid and has all hooks
          if (!ReactInstance || typeof ReactInstance !== 'object') {
            throw new Error('ReactInstance is invalid: ' + typeof ReactInstance);
          }
          
          const requiredHooks = ['useState', 'useEffect', 'useRef', 'useCallback', 'useMemo', 'useLayoutEffect'];
          for (const hook of requiredHooks) {
            if (typeof ReactInstance[hook] !== 'function') {
              throw new Error('React hook ' + hook + ' is not a function. Type: ' + typeof ReactInstance[hook]);
            }
          }
          
          // CRITICAL: Store React instance in a way that persists and can't be garbage collected
          // We create a closure that always references the React instance
          // This ensures the hooks always have access to React even if window.React changes
          const _reactInstance = ReactInstance;
          
          // Get ReactDOM (optional, may be null)
          function getReactDOM() {
            if (typeof window !== 'undefined' && window.ReactDOM && window.ReactDOM !== null) {
              return window.ReactDOM;
            }
            return null;
          }
          
          const ReactDOMInstance = getReactDOM();
          
          // Create Proxy for default React export (used for JSX/React.createElement)
          // This allows dynamic access for JSX, but hooks MUST be direct references
          const ReactProxy = new Proxy({}, {
            get(target, prop) {
              // Always get fresh React instance from window, fallback to captured instance
              const react = typeof window !== 'undefined' && window.React && window.React !== null 
                ? window.React 
                : _reactInstance;
              return react[prop];
            }
          });
          
          // CRITICAL: Export hooks as DIRECT references to React's actual hook functions
          // React's hook system tracks hooks by function identity and call order
          // We CANNOT wrap, bind, or modify these functions in any way
          // These must be the exact same functions that React uses internally
          // We use _reactInstance (captured in closure) to ensure the reference persists
          // index.html ensures React is loaded before this module, so _reactInstance is valid
          export const useState = _reactInstance.useState;
          export const useEffect = _reactInstance.useEffect;
          export const useRef = _reactInstance.useRef;
          export const useCallback = _reactInstance.useCallback;
          export const useMemo = _reactInstance.useMemo;
          export const useLayoutEffect = _reactInstance.useLayoutEffect;
          export const createElement = _reactInstance.createElement;
          
          // Export React components and utilities (these are static, can use captured instance)
          export const Fragment = ReactInstance.Fragment;
          export const Component = ReactInstance.Component;
          export const PureComponent = ReactInstance.PureComponent;
          export const memo = ReactInstance.memo;
          export const forwardRef = ReactInstance.forwardRef;
          export const lazy = ReactInstance.lazy;
          export const Suspense = ReactInstance.Suspense;
          export const StrictMode = ReactInstance.StrictMode;
          
          // Export React and ReactDOM
          export const React = ReactProxy;
          export const ReactDOM = ReactDOMInstance;
          
          // Default export is the Proxy (for JSX)
          export default ReactProxy;
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
