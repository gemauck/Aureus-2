/**
 * Admin stock count: download Excel template, upload completed count.
 * Loaded via lazy-load-components → window.StockCountView
 */
(function () {
  const React = window.React;
  if (!React) return;

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function StockCountView({ isDark = false, onApplied }) {
    const [busy, setBusy] = React.useState(false);
    const [message, setMessage] = React.useState(null);
    const [error, setError] = React.useState(null);
    const [lastResult, setLastResult] = React.useState(null);
    const [dryRun, setDryRun] = React.useState(true);
    const [forceDup, setForceDup] = React.useState(false);
    const fileInputRef = React.useRef(null);

    const card = isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100';
    const text = isDark ? 'text-gray-100' : 'text-gray-900';
    const muted = isDark ? 'text-gray-400' : 'text-gray-500';
    const btn = isDark
      ? 'px-4 py-2 text-sm rounded-lg border border-gray-600 text-gray-200 hover:bg-gray-800'
      : 'px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-800 hover:bg-gray-50';
    const btnPrimary = 'px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50';

    const authHeaders = () => {
      const token = window.storage?.getToken?.();
      const h = { 'Content-Type': 'application/json' };
      if (token) h.Authorization = 'Bearer ' + token;
      return h;
    };

    const apiBase = window.DatabaseAPI?.API_BASE || window.location.origin;

    const handleDownload = async () => {
      setError(null);
      setMessage(null);
      setBusy(true);
      try {
        const res = await fetch(apiBase + '/api/manufacturing/stock-count/export', {
          method: 'GET',
          headers: authHeaders()
        });
        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || res.statusText);
        }
        const blob = await res.blob();
        const cd = res.headers.get('Content-Disposition');
        let name = 'stock-count-template.xlsx';
        if (cd) {
          const m = /filename="([^"]+)"/.exec(cd);
          if (m) name = m[1];
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        URL.revokeObjectURL(url);
        setMessage('Download started.');
      } catch (e) {
        setError(e.message || 'Export failed');
      } finally {
        setBusy(false);
      }
    };

    const runImport = async (file, opts) => {
      setError(null);
      setMessage(null);
      setLastResult(null);
      setBusy(true);
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const res = await fetch(apiBase + '/api/manufacturing/stock-count/import', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            file: { name: file.name, dataUrl },
            dryRun: opts.dryRun,
            forceCreateDuplicate: opts.forceDup
          })
        });
        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(text || res.statusText);
        }
        if (!res.ok) {
          const msg =
            data?.error?.message || data?.message || data?.error || text || 'Import failed';
          throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
        }
        const payload = data?.data ?? data;
        setLastResult(payload);
        if (opts.dryRun) {
          let msg =
            'Dry run complete. Movements that would be created: ' + (payload.movementsWouldCreate ?? 0) + '.';
          if (payload.duplicateCandidates?.length) {
            msg +=
              ' Note: ' +
              payload.duplicateCandidates.length +
              ' possible name duplicate(s) — review preview; use “Allow duplicate names” only if intended.';
          }
          setMessage(msg);
        } else {
          setMessage('Import applied. Movements created: ' + (payload.movementsCreated ?? 0) + '.');
          if (typeof onApplied === 'function') onApplied();
        }
      } catch (e) {
        setError(e.message || 'Import failed');
      } finally {
        setBusy(false);
      }
    };

    const onFileChange = (e) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (!f) return;
      void runImport(f, { dryRun, forceDup });
    };

    return React.createElement(
      'div',
      { className: 'space-y-4 erp-module-root' },
      React.createElement(
        'div',
        { className: 'rounded-xl border p-5 shadow-sm ' + card },
        React.createElement('h3', { className: 'text-lg font-semibold ' + text }, 'Stock count (Excel)'),
        React.createElement(
          'ul',
          { className: 'mt-2 text-sm list-disc pl-5 space-y-1 ' + muted },
          React.createElement('li', null, 'Download the template — one sheet per location.'),
          React.createElement('li', null, 'Fill ', React.createElement('strong', null, 'CountedQty'), ' only; do not rename columns.'),
          React.createElement(
            'li',
            null,
            'New lines: leave ',
            React.createElement('strong', null, 'SKU'),
            ' blank; set ',
            React.createElement('strong', null, 'ItemName'),
            ' and ',
            React.createElement('strong', null, 'CountedQty'),
            '.'
          ),
          React.createElement('li', null, 'Run dry run first. Apply blocks duplicate names unless you check “Allow duplicate names”.')
        )
      ),
      React.createElement(
        'div',
        { className: 'flex flex-wrap gap-3 items-center' },
        React.createElement(
          'button',
          { type: 'button', disabled: busy, className: btnPrimary, onClick: handleDownload },
          busy ? '…' : React.createElement(React.Fragment, null, React.createElement('i', { className: 'fas fa-download mr-2' }), 'Download template')
        ),
        React.createElement(
          'label',
          { className: 'inline-flex items-center gap-2 cursor-pointer text-sm ' + muted },
          React.createElement('input', { type: 'checkbox', checked: dryRun, onChange: (e) => setDryRun(e.target.checked) }),
          'Dry run only'
        ),
        React.createElement(
          'label',
          { className: 'inline-flex items-center gap-2 cursor-pointer text-sm ' + muted },
          React.createElement('input', {
            type: 'checkbox',
            checked: forceDup,
            onChange: (e) => setForceDup(e.target.checked)
          }),
          'Allow duplicate names (apply)'
        ),
        React.createElement(
          'button',
          { type: 'button', disabled: busy, className: btn, onClick: () => fileInputRef.current?.click() },
          React.createElement('i', { className: 'fas fa-upload mr-2' }),
          dryRun ? 'Upload (dry run)' : 'Upload (apply)'
        ),
        React.createElement('input', {
          ref: fileInputRef,
          type: 'file',
          accept: '.xlsx,.xls',
          className: 'hidden',
          onChange: onFileChange
        })
      ),
      message &&
        React.createElement('div', { className: 'rounded-lg border border-green-200 bg-green-50 text-green-800 text-sm px-4 py-2' }, message),
      error &&
        React.createElement('div', { className: 'rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-2 whitespace-pre-wrap' }, error),
      lastResult &&
        lastResult.preview &&
        React.createElement(
          'div',
          { className: 'rounded-xl border overflow-hidden ' + card },
          React.createElement(
            'div',
            { className: 'px-4 py-2 border-b ' + (isDark ? 'border-gray-800' : 'border-gray-100') },
            React.createElement('h4', { className: 'text-sm font-semibold ' + text }, 'Preview (first 30 rows)')
          ),
          React.createElement(
            'div',
            { className: 'overflow-x-auto max-h-80' },
            React.createElement(
              'table',
              { className: 'w-full text-xs' },
              React.createElement(
                'thead',
                null,
                React.createElement(
                  'tr',
                  { className: isDark ? 'bg-gray-800' : 'bg-gray-50' },
                  ['Location', 'SKU', 'Name', 'Delta', 'Sheet', 'Row'].map((h) =>
                    React.createElement(
                      'th',
                      { key: h, className: 'text-left px-3 py-2 font-medium ' + muted },
                      h
                    )
                  )
                )
              ),
              React.createElement(
                'tbody',
                null,
                lastResult.preview.slice(0, 30).map((p, i) =>
                  React.createElement(
                    'tr',
                    { key: i, className: isDark ? 'border-t border-gray-800' : 'border-t border-gray-100' },
                    React.createElement('td', { className: 'px-3 py-1 ' + text }, p.locationId),
                    React.createElement('td', { className: 'px-3 py-1 ' + text }, p.sku || p.proposedSku || '—'),
                    React.createElement('td', { className: 'px-3 py-1 ' + text }, (p.itemName || '').slice(0, 40)),
                    React.createElement('td', { className: 'px-3 py-1 ' + text }, p.delta),
                    React.createElement('td', { className: 'px-3 py-1 ' + text }, p.sheet),
                    React.createElement('td', { className: 'px-3 py-1 ' + text }, p.rowNum)
                  )
                )
              )
            )
          )
        )
    );
  }

  window.StockCountView = StockCountView;
})();
