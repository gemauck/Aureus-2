/**
 * HR policy body → HTML for display (plain-text structure + safe HTML passthrough).
 * Exposed on window from core-entry for non-bundled JSX panels.
 */

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function sanitizePolicyHtml(html) {
    return String(html || '').replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
}

function looksLikeHtmlContent(s) {
    return /<[a-z][a-z0-9]*\b/i.test(String(s || '').trim());
}

function isAllCapsLine(line) {
    const t = line.trim();
    if (t.length < 2) return false;
    const letters = t.replace(/[^a-zA-Z]/g, '');
    return letters.length > 0 && letters === letters.toUpperCase();
}

function wordCount(line) {
    return line.trim().split(/\s+/).filter(Boolean).length;
}

function looksLikeCapsPartyLine(line) {
    const t = line.trim();
    return /\bPTY\b|\(PTY\)|\bLTD\b|\bCC\b|\bINC\b/i.test(t) && t.length < 80;
}

function isLikelySectionHeading(line) {
    const t = line.trim();
    if (!t || t.includes('\n')) return false;
    if (/^Example:/i.test(t)) return false;
    if (isAllCapsLine(t) && !looksLikeCapsPartyLine(t)) return true;
    if (/:$/.test(t) && t.length < 100) return true;
    if (wordCount(t) <= 8 && t.length < 72 && !/[.!?]$/.test(t) && /^[A-Z]/.test(t)) return true;
    return false;
}

function policyPlainTextToStructuredHtml(raw) {
    const blocks = String(raw || '')
        .split(/\n\n+/)
        .map((b) => b.trim())
        .filter(Boolean);
    const parts = [];
    let i = 0;

    while (i < blocks.length) {
        const block = blocks[i];
        const oneLine = !block.includes('\n');
        const line = oneLine ? block : null;

        if (oneLine && block.trim().endsWith(':')) {
            let j = i + 1;
            const items = [];
            while (j < blocks.length) {
                const bj = blocks[j];
                if (bj.includes('\n')) break;
                if (bj.length > 260) break;
                if (items.length > 0 && isLikelySectionHeading(bj)) break;
                if (items.length === 0 && isLikelySectionHeading(bj) && !/^Contains\b/i.test(bj)) break;
                if (isAllCapsLine(bj) && bj.length >= 10 && items.length > 0) break;
                items.push(bj);
                j += 1;
            }
            if (items.length >= 2) {
                parts.push(
                    `<div class="policy-list-block mb-4"><p class="text-gray-800 leading-relaxed mb-2">${escapeHtml(block)}</p><ul class="list-disc pl-5 space-y-1.5 text-gray-700 marker:text-gray-400">${items
                        .map((it) => `<li class="pl-0.5">${escapeHtml(it)}</li>`)
                        .join('')}</ul></div>`
                );
                i = j;
                continue;
            }
        }

        if (oneLine && line) {
            if (i === 0) {
                parts.push(
                    `<h2 class="policy-doc-title text-xl font-bold text-gray-900 tracking-tight border-b border-gray-200 pb-3 mb-4">${escapeHtml(line)}</h2>`
                );
                i += 1;
                continue;
            }
            if (isAllCapsLine(line) && !looksLikeCapsPartyLine(line) && line.length >= 12) {
                parts.push(
                    `<h3 class="policy-section-title text-sm font-semibold text-gray-900 uppercase tracking-wider mt-8 mb-2">${escapeHtml(line)}</h3>`
                );
                i += 1;
                continue;
            }
            if (isAllCapsLine(line) && line.length < 12 && !looksLikeCapsPartyLine(line)) {
                parts.push(
                    `<h4 class="policy-minor-head text-sm font-semibold text-gray-900 uppercase tracking-wide mt-6 mb-1">${escapeHtml(line)}</h4>`
                );
                i += 1;
                continue;
            }
            if (isLikelySectionHeading(line) && !isAllCapsLine(line)) {
                parts.push(
                    `<h4 class="policy-subsection text-sm font-semibold text-gray-800 mt-5 mb-1.5">${escapeHtml(line)}</h4>`
                );
                i += 1;
                continue;
            }
        }

        const body = escapeHtml(block).replace(/\n/g, '<br />');
        parts.push(`<p class="policy-para text-gray-700 leading-relaxed my-2.5">${body}</p>`);
        i += 1;
    }

    return parts.join('\n');
}

export function policyBodyToDisplayHtml(body) {
    if (!body) return '';
    if (looksLikeHtmlContent(body)) {
        return sanitizePolicyHtml(body);
    }
    return policyPlainTextToStructuredHtml(body);
}

if (typeof window !== 'undefined') {
    window.policyBodyToDisplayHtml = policyBodyToDisplayHtml;
}
