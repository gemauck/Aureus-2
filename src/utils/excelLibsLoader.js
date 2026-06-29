// Lazy-load SheetJS / ExcelJS on demand (avoids ~2–3MB CDN download on every page).

function xlsxReady(x) {
    return !!(x && (x.utils || typeof x.read === 'function'));
}

function excelJSReady(E) {
    if (!E) return false;
    const z = E.default || E;
    return typeof z.Workbook === 'function';
}

function resolveXLSX() {
    if (typeof window.__erpResolveXLSX === 'function') {
        const x = window.__erpResolveXLSX();
        if (x) return x;
    }
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    return xlsxReady(g.XLSX) ? g.XLSX : null;
}

function resolveExcelJS() {
    if (typeof window.__erpResolveExcelJS === 'function') {
        const e = window.__erpResolveExcelJS();
        if (e) return e;
    }
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    const onG = g.ExcelJS;
    if (excelJSReady(onG)) return onG.default || onG;
    return null;
}

let xlsxLoadPromise = null;
let excelJsLoadPromise = null;

function injectScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.crossOrigin = 'anonymous';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
    });
}

export function ensureXLSX() {
    const existing = resolveXLSX();
    if (existing) {
        window.XLSX = existing;
        return Promise.resolve(existing);
    }
    if (!xlsxLoadPromise) {
        xlsxLoadPromise = injectScript(
            'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js'
        ).then(() => {
            const x = resolveXLSX();
            if (!x) throw new Error('XLSX failed to initialize');
            window.XLSX = x;
            return x;
        }).catch((err) => {
            xlsxLoadPromise = null;
            throw err;
        });
    }
    return xlsxLoadPromise;
}

export function ensureExcelJS() {
    const existing = resolveExcelJS();
    if (existing) {
        window.ExcelJS = existing;
        return Promise.resolve(existing);
    }
    if (!excelJsLoadPromise) {
        excelJsLoadPromise = injectScript(
            'https://unpkg.com/exceljs@4.4.0/dist/exceljs.min.js'
        ).then(() => {
            const e = resolveExcelJS();
            if (!e) throw new Error('ExcelJS failed to initialize');
            window.ExcelJS = e;
            return e;
        }).catch((err) => {
            excelJsLoadPromise = null;
            throw err;
        });
    }
    return excelJsLoadPromise;
}

if (typeof window !== 'undefined') {
    window.ensureXLSX = ensureXLSX;
    window.ensureExcelJS = ensureExcelJS;
}
