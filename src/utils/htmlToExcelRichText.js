/** Excel ARGB for default note text (black). */
export const DEFAULT_EXCEL_FONT_ARGB = 'FF000000';

const NAMED_COLORS = {
    black: '000000',
    gray: '6b7280',
    grey: '6b7280',
    red: 'dc2626',
    orange: 'ea580c',
    amber: 'ca8a04',
    green: '16a34a',
    cyan: '0891b2',
    blue: '2563eb',
    violet: '7c3aed',
    pink: 'db2777'
};

/** Map editor / CSS color to ExcelJS ARGB (FF + RRGGBB). */
export function normalizeColorToArgb(input) {
    if (!input) return DEFAULT_EXCEL_FONT_ARGB;
    let c = String(input).trim().toLowerCase();
    if (!c) return DEFAULT_EXCEL_FONT_ARGB;

    const rgb = c.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (rgb) {
        const hex = (n) => Math.min(255, Math.max(0, Number(n))).toString(16).padStart(2, '0');
        return `FF${hex(rgb[1])}${hex(rgb[2])}${hex(rgb[3])}`.toUpperCase();
    }

    if (c.startsWith('#')) c = c.slice(1);
    if (/^[0-9a-f]{6}$/i.test(c)) return `FF${c.toUpperCase()}`;
    if (/^[0-9a-f]{3}$/i.test(c)) {
        return `FF${c.split('').map((ch) => ch + ch).join('').toUpperCase()}`;
    }

    if (NAMED_COLORS[c]) return `FF${NAMED_COLORS[c].toUpperCase()}`;

    return DEFAULT_EXCEL_FONT_ARGB;
}

function extractColorFromElement(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;
    const tag = el.tagName.toLowerCase();
    if (tag === 'font') {
        const attr = el.getAttribute('color');
        if (attr) return normalizeColorToArgb(attr);
    }
    const style = el.getAttribute('style') || '';
    const match = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
    if (match) return normalizeColorToArgb(match[1].trim());
    return null;
}

function plainTextFromHtmlRegex(html) {
    return String(html)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(div|p|li|tr|h[1-6])\s*>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&#39;/gi, "'")
        .replace(/&quot;/gi, '"')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/** Plain text for XLSX fallback export. */
export function htmlToPlainTextForExport(html) {
    if (!html || typeof html !== 'string') return '';
    const s = String(html).trim();
    if (!s) return '';
    if (typeof document === 'undefined') return plainTextFromHtmlRegex(s);

    const withBreaks = s
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(div|p|li|tr|h[1-6])\s*>/gi, '\n');
    const tmp = document.createElement('div');
    tmp.innerHTML = withBreaks;
    let text = tmp.textContent || tmp.innerText || '';
    text = text.replace(/\u00a0/g, ' ');
    return text.replace(/\n{3,}/g, '\n\n').trim();
}

/** Parse note HTML into coloured text runs. */
export function parseHtmlToTextSegments(html) {
    const segments = [];
    if (!html || typeof html !== 'string') return segments;
    const trimmed = String(html).trim();
    if (!trimmed) return segments;

    if (typeof document === 'undefined') {
        return [{ text: plainTextFromHtmlRegex(trimmed), color: DEFAULT_EXCEL_FONT_ARGB }];
    }

    const root = document.createElement('div');
    root.innerHTML = trimmed.replace(/<br\s*\/?>/gi, '<br/>');

    const pushText = (text, color) => {
        if (text == null || text === '') return;
        const t = String(text).replace(/\u00a0/g, ' ');
        if (!t) return;
        const argb = color || DEFAULT_EXCEL_FONT_ARGB;
        const last = segments[segments.length - 1];
        if (last && last.color === argb) {
            last.text += t;
        } else {
            segments.push({ text: t, color: argb });
        }
    };

    const pushNewline = (color) => {
        const last = segments[segments.length - 1];
        if (last && last.text.endsWith('\n')) return;
        pushText('\n', color);
    };

    const blockTags = new Set(['div', 'p', 'li', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

    const walk = (node, inheritedColor) => {
        if (!node) return;
        if (node.nodeType === Node.TEXT_NODE) {
            pushText(node.textContent, inheritedColor);
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;

        const tag = node.tagName.toLowerCase();
        const color = extractColorFromElement(node) || inheritedColor || DEFAULT_EXCEL_FONT_ARGB;

        if (tag === 'br') {
            pushNewline(color);
            return;
        }

        Array.from(node.childNodes).forEach((child) => walk(child, color));
        if (blockTags.has(tag)) {
            pushNewline(inheritedColor || DEFAULT_EXCEL_FONT_ARGB);
        }
    };

    Array.from(root.childNodes).forEach((child) => walk(child, DEFAULT_EXCEL_FONT_ARGB));

    const merged = [];
    for (const seg of segments) {
        const collapsed = seg.text.replace(/\n{3,}/g, '\n\n');
        if (!collapsed) continue;
        const last = merged[merged.length - 1];
        if (last && last.color === seg.color) {
            last.text += collapsed;
        } else {
            merged.push({ text: collapsed, color: seg.color });
        }
    }

    if (merged.length && merged[0].text) {
        merged[0].text = merged[0].text.replace(/^\n+/, '');
    }
    if (merged.length) {
        const last = merged[merged.length - 1];
        last.text = last.text.replace(/\n+$/, '');
    }

    return merged.filter((s) => s.text);
}

export function segmentsToExcelRichText(segments, fontSize = 11) {
    const runs = (segments || [])
        .filter((s) => s && s.text)
        .map((s) => ({
            text: s.text,
            font: {
                size: fontSize,
                name: 'Calibri',
                color: { argb: s.color || DEFAULT_EXCEL_FONT_ARGB }
            }
        }));
    if (!runs.length) return '';
    return { richText: runs };
}

/** ExcelJS cell value with colours when present; otherwise plain string. */
export function htmlToExcelRichTextValue(html, fontSize = 11) {
    const segments = parseHtmlToTextSegments(html);
    if (!segments.length) return '';
    const hasCustomColor = segments.some(
        (s) => s.color && s.color !== DEFAULT_EXCEL_FONT_ARGB
    );
    if (!hasCustomColor) {
        return segments.map((s) => s.text).join('');
    }
    return segmentsToExcelRichText(segments, fontSize);
}

/** Tailwind sky-50 — working-month column tint in Monthly Data Review. */
export const WORKING_MONTH_FILL_ARGB = 'FFF0F9FF';

/**
 * Apply tracker status cell colours to an ExcelJS cell (matches optionStyle in the UI).
 * @param {object} cell - ExcelJS cell
 * @param {object|null} statusConfig - status option with optionStyle { backgroundColor, color }
 * @param {{ workingMonth?: boolean, fillOnly?: boolean }} [opts]
 */
export function applyTrackerStatusCellStyle(cell, statusConfig, opts = {}) {
    if (!cell) return;
    const { workingMonth = false, fillOnly = false } = opts;
    const style = statusConfig?.optionStyle;
    const bgHex = style?.backgroundColor || (workingMonth && !statusConfig ? '#f0f9ff' : null);

    if (bgHex) {
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: normalizeColorToArgb(bgHex) }
        };
    }

    if (!fillOnly && style) {
        cell.font = {
            name: 'Calibri',
            size: 11,
            bold: true,
            color: { argb: normalizeColorToArgb(style.color || '#1f2937') }
        };
    }
}

/** Append plain suffix (e.g. reviewed stamp) to a string or richText value. */
export function appendPlainTextToRichValue(value, plainSuffix) {
    const suffix = plainSuffix == null ? '' : String(plainSuffix);
    if (!suffix) return value == null ? '' : value;

    if (!value || value === '') return suffix;

    if (typeof value === 'string') {
        return `${value}${value ? '\n' : ''}${suffix}`;
    }

    if (value.richText && Array.isArray(value.richText)) {
        const runs = [...value.richText];
        const last = runs[runs.length - 1];
        const defaultFont = {
            size: 11,
            name: 'Calibri',
            color: { argb: DEFAULT_EXCEL_FONT_ARGB }
        };
        if (last && last.font) {
            runs.push({
                text: `${runs.length && last.text ? '\n' : ''}${suffix}`,
                font: { ...defaultFont, ...last.font, color: { argb: DEFAULT_EXCEL_FONT_ARGB } }
            });
        } else {
            runs.push({ text: suffix, font: defaultFont });
        }
        return { richText: runs };
    }

    return suffix;
}
