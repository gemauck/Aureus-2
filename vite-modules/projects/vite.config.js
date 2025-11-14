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
          // Lazy getter for React - checks window.React every time it's called
          // This ensures React is available when hooks are actually used, not just at module load
          const getReact = () => {
            if (typeof window !== 'undefined' && window.React && window.React !== null) {
              return window.React;
            }
            // If React isn't available, throw with helpful error
            throw new Error('window.React is not available. The Vite module should load after React is ready. Current window.React: ' + typeof window.React);
          };
          
          const getReactDOM = () => {
            if (typeof window !== 'undefined' && window.ReactDOM && window.ReactDOM !== null) {
              return window.ReactDOM;
            }
            return null;
          };
          
          // Create a lazy React Proxy - React is accessed every time a property is accessed
          // This ensures window.React is checked at runtime, not just at module evaluation
          const React = new Proxy({}, {
            get(target, prop) {
              const react = getReact();
              if (!react || react === null) {
                throw new Error('React is null when accessing ' + prop);
              }
              const value = react[prop];
              // For functions (hooks, createElement, etc.), return them directly
              // React's hook system needs direct access to the actual functions
              return typeof value === 'function' ? value.bind(react) : value;
            }
          });
          
          const ReactDOM = getReactDOM();
          
          // Export React as Proxy - hooks will be accessed lazily through the Proxy
          export default React;
          
          // Export hooks - they access React through the Proxy, which checks React at runtime
          // The Proxy's getter is called when the export is evaluated, but it will check React again
          // when the hook is actually called (since hooks are functions that maintain their binding)
          export const useState = React.useState;
          export const useEffect = React.useEffect;
          export const useRef = React.useRef;
          export const useCallback = React.useCallback;
          export const useMemo = React.useMemo;
          export const useLayoutEffect = React.useLayoutEffect;
          export const createElement = React.createElement;
          export const Fragment = React.Fragment;
          export const Component = React.Component;
          export const PureComponent = React.PureComponent;
          export const memo = React.memo;
          export const forwardRef = React.forwardRef;
          export const lazy = React.lazy;
          export const Suspense = React.Suspense;
          export const StrictMode = React.StrictMode;
          export { React, ReactDOM };
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
