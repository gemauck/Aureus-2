/**
 * Page shell layout and content-area class helpers for MainLayout.
 */

/**
 * @param {string} currentPage
 * @param {{ effectiveIsMobile: boolean, isDark: boolean }} opts
 */
export function getMainScrollClasses(currentPage, { effectiveIsMobile, isDark }) {
    const overflowX = currentPage === 'clients' ? 'overflow-x-auto' : 'overflow-x-hidden';
    const overflowY =
        currentPage === 'clients' && effectiveIsMobile
            ? 'flex flex-col min-h-0 overflow-y-hidden'
            : 'overflow-y-auto';
    const bg = isDark ? '' : 'bg-[#f8fafc]';
    let padding = 'px-3 py-4 sm:p-6';
    if (currentPage === 'clients') {
        padding = 'p-0';
    } else if (currentPage === 'dashboard' && effectiveIsMobile) {
        padding = 'px-2 py-4 sm:px-6 sm:py-6';
    }
    return `flex-1 min-w-0 ${overflowX} ${overflowY} ${bg} ${padding}`;
}

/**
 * @param {string} currentPage
 * @param {{ effectiveIsMobile: boolean }} opts
 */
export function getMainInnerClasses(currentPage, { effectiveIsMobile }) {
    const base = 'erp-module-root w-full min-w-0';
    if (currentPage === 'clients' && effectiveIsMobile) {
        return `${base} flex flex-1 flex-col min-h-0 px-2 lg:px-3 py-4`;
    }
    if (currentPage === 'clients') {
        return `${base} px-2 lg:px-3 py-4`;
    }
    if (currentPage === 'dashboard' && effectiveIsMobile) {
        return `${base} flex flex-col min-h-0 min-w-0`;
    }
    return base;
}
