/**
 * Pure helpers for resolving lazy-loaded window.* React components.
 */

/** @param {unknown} value */
export function isFunctionComponent(value) {
    return Boolean(value && typeof value === 'function');
}

/** React function components or memo/forwardRef objects. */
export function isReactComponent(value) {
    return (
        isFunctionComponent(value) ||
        Boolean(value && typeof value === 'object' && value.$$typeof)
    );
}

/** @param {unknown} value */
export function isFullProjectsComponent(value) {
    return Boolean(value && typeof value === 'function' && (value._hasListView || value._version));
}

/** @param {string} label */
export function plainLoadingFallback(label) {
    return () => React.createElement('div', { className: 'text-center py-12 text-gray-500' }, label);
}

/** @param {string} label @param {boolean} [isDark] */
export function spinnerCardFallback(label, isDark = false) {
    const cardClass = isDark
        ? 'bg-gray-800 border-gray-700 text-gray-300'
        : 'bg-white border-gray-200 text-gray-600';
    return () => React.createElement(
        'div',
        { className: `${cardClass} border rounded-lg p-6 text-center` },
        React.createElement('div', { className: 'animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4' }),
        React.createElement('p', null, label)
    );
}

/** @param {string} label */
export function centeredSpinnerFallback(label) {
    return () => React.createElement(
        'div',
        { className: 'flex items-center justify-center min-h-[400px]' },
        React.createElement(
            'div',
            { className: 'text-center' },
            React.createElement('div', { className: 'animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto mb-4' }),
            React.createElement('p', { className: 'text-gray-500' }, label)
        )
    );
}
