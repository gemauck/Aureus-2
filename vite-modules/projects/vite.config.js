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
          
          // CRITICAL: React hooks must access React dynamically every time they're called
          // This ensures React is available even if it loads after the module
          // We create wrapper functions that call getReact() on each invocation
          // React's hook system will work correctly as long as we call the actual React hooks
          
          // Export hooks as functions that dynamically access React
          // This ensures React is available every time a hook is called
          export const useState = (...args) => {
            const react = getReact();
            return react.useState(...args);
          };
          export const useEffect = (...args) => {
            const react = getReact();
            return react.useEffect(...args);
          };
          export const useRef = (...args) => {
            const react = getReact();
            return react.useRef(...args);
          };
          export const useCallback = (...args) => {
            const react = getReact();
            return react.useCallback(...args);
          };
          export const useMemo = (...args) => {
            const react = getReact();
            return react.useMemo(...args);
          };
          export const useLayoutEffect = (...args) => {
            const react = getReact();
            return react.useLayoutEffect(...args);
          };
          export const createElement = (...args) => {
            const react = getReact();
            return react.createElement(...args);
          };
          
          // These can be accessed through the Proxy, but export them for convenience
          export const Fragment = (() => {
            try {
              return getReact().Fragment;
            } catch {
              return Symbol.for('react.fragment');
            }
          })();
          export const Component = (() => {
            try {
              return getReact().Component;
            } catch {
              return class Component {};
            }
          })();
          export const PureComponent = (() => {
            try {
              return getReact().PureComponent;
            } catch {
              return class PureComponent {};
            }
          })();
          export const memo = (...args) => {
            const react = getReact();
            return react.memo(...args);
          };
          export const forwardRef = (...args) => {
            const react = getReact();
            return react.forwardRef(...args);
          };
          export const lazy = (...args) => {
            const react = getReact();
            return react.lazy(...args);
          };
          export const Suspense = (() => {
            try {
              return getReact().Suspense;
            } catch {
              return ({ children }) => children;
            }
          })();
          export const StrictMode = (() => {
            try {
              return getReact().StrictMode;
            } catch {
              return ({ children }) => children;
            }
          })();
          
          export const React = ReactProxy;
          export const ReactDOM = (() => {
            try {
              return getReactDOM();
            } catch {
              return null;
            }
          })();
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
