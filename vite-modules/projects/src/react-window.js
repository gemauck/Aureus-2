// React shim that provides window.React to ES6 modules
// This ensures React hooks always work correctly

if (typeof window === 'undefined' || !window.React) {
  throw new Error('window.React is not available. Please ensure React is loaded before this module.');
}

// Get React instance
const ReactInstance = window.React;

// Validate React instance
if (!ReactInstance || typeof ReactInstance !== 'object') {
  throw new Error('React instance is invalid');
}

// Validate hooks
const requiredHooks = [
  'useState',
  'useEffect',
  'useRef',
  'useCallback',
  'useMemo',
  'useLayoutEffect',
  'useContext'
];
for (const hook of requiredHooks) {
  if (typeof ReactInstance[hook] !== 'function') {
    throw new Error(`React hook ${hook} is not a function`);
  }
}

// Export hooks as direct references
export const useState = ReactInstance.useState;
export const useEffect = ReactInstance.useEffect;
export const useRef = ReactInstance.useRef;
export const useCallback = ReactInstance.useCallback;
export const useMemo = ReactInstance.useMemo;
export const useLayoutEffect = ReactInstance.useLayoutEffect;
export const useContext = ReactInstance.useContext;
export const createElement = ReactInstance.createElement;

// Export React components and utilities
export const Fragment = ReactInstance.Fragment;
export const Component = ReactInstance.Component;
export const PureComponent = ReactInstance.PureComponent;
export const memo = ReactInstance.memo;
export const forwardRef = ReactInstance.forwardRef;
export const lazy = ReactInstance.lazy;
export const Suspense = ReactInstance.Suspense;
export const StrictMode = ReactInstance.StrictMode;

// Export React and ReactDOM
export const React = ReactInstance;
export const ReactDOM = typeof window !== 'undefined' && window.ReactDOM ? window.ReactDOM : null;

// Default export
export default ReactInstance;

