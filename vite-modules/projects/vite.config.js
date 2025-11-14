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
          // Lazy getter for React - ensures window.React is available
          const getReact = () => {
            if (typeof window !== 'undefined' && window.React) {
              return window.React;
            }
            // Wait a bit if React isn't ready yet (shouldn't happen, but safety)
            throw new Error('window.React is not available. Make sure React is loaded before this module.');
          };
          
          const getReactDOM = () => {
            if (typeof window !== 'undefined' && window.ReactDOM) {
              return window.ReactDOM;
            }
            return null;
          };
          
          // Get React immediately - if it fails, the error will be thrown
          const React = getReact();
          const ReactDOM = getReactDOM();
          
          // Export all React APIs
          export default React;
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
