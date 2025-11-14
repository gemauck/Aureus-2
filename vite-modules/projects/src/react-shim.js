// React shim - use window.React from main app instead of bundling React
// This ensures we use the same React instance as the main application
// This file is evaluated at runtime, so window.React will be available
const getReact = () => {
  if (typeof window !== 'undefined' && window.React) {
    return window.React;
  }
  throw new Error('window.React is not available. Make sure React is loaded before this module.');
};

const getReactDOM = () => {
  if (typeof window !== 'undefined' && window.ReactDOM) {
    return window.ReactDOM;
  }
  return null;
};

const React = getReact();
const ReactDOM = getReactDOM();

// Export React hooks and utilities
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

// Named exports
export { React, ReactDOM };

// Default export
export default React;

