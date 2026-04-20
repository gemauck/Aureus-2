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
    const [submissions, setSubmissions] = React.useState([]);
    const [submissionsLoading, setSubmissionsLoading] = React.useState(false);
    const [submissionDetail, setSubmissionDetail] = React.useState(null);
    const [detailLoading, setDetailLoading] = React.useState(false);
    const [applyingSubmissionId, setApplyingSubmissionId] = React.useState('');
    const [detailEditMode, setDetailEditMode] = React.useState(false);
    const [editedLines, setEditedLines] = React.useState(null);
    const [detailSaving, setDetailSaving] = React.useState(false);
    const [rejectReason, setRejectReason] = React.useState('');
    const [rejectBusyId, setRejectBusyId] = React.useState('');
    const [deleteBusyId, setDeleteBusyId] = React.useState('');
    const fileInputRef = React.useRef(null);

    const card = isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100';
    const text = isDark ? 'text-gray-100' : 'text-gray-900';
    const muted = isDark ? 'text-gray-400' : 'text-gray-500';
    const btn = isDark
      ? 'px-4 py-2 text-sm rounded-lg border border-gray-600 text-gray-200 hover:bg-gray-800'
      : 'px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-800 hover:bg-gray-50';
    const btnPrimary = 'px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50';
    const btnDanger = isDark
      ? 'px-4 py-2 text-sm rounded-lg border border-red-700 text-red-200 hover:bg-red-950 disabled:opacity-50'
      : 'px-4 py-2 text-sm rounded-lg border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50';
    const inputCell =
      'w-full min-w-[4rem] max-w-[10rem] rounded border px-1.5 py-0.5 text-xs ' +
      (isDark ? 'border-gray-600 bg-gray-900 text-gray-100' : 'border-gray-300 bg-white text-gray-900');

    const authHeaders = () => {
      const token = window.storage?.getToken?.();
      const h = { 'Content-Type': 'application/json' };
      if (token) h.Authorization = 'Bearer ' + token;
      return h;
    };

    const apiBase = window.DatabaseAPI?.API_BASE || window.location.origin;
    const parseLineMeta = (line) => {
      try {
        return line?.meta ? JSON.parse(line.meta) : {};
      } catch {
        return {};
      }
    };

    const lineToApiPayload = (line) => {
      const meta = parseLineMeta(line);
      return {
        sku: line.sku,
        itemName: line.itemName,
        unit: line.unit || 'pcs',
        systemQty: Number(line.systemQty),
        countedQty: Number(line.countedQty),
        isNewItem: meta.isNewItem === true,
        proposedItemDetails:
          meta.proposedItemDetails && typeof meta.proposedItemDetails === 'object' ? meta.proposedItemDetails : {},
        locationInventoryId: line.locationInventoryId || undefined,
        inventoryItemId: line.inventoryItemId || undefined,
        draftRowKey: meta.draftRowKey || line.id
      };
    };

    const loadSubmissions = React.useCallback(async () => {
      setSubmissionsLoading(true);
      try {
        const res = await fetch(apiBase + '/api/manufacturing/stock-take-submissions?status=pending_review', {
          method: 'GET',
          headers: authHeaders()
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || res.statusText);
        }
        const data = await res.json();
        const rows = data?.data?.submissions || data?.submissions || [];
        setSubmissions(Array.isArray(rows) ? rows : []);
      } catch (e) {
        setError(e.message || 'Failed to load pending stock-take submissions');
      } finally {
        setSubmissionsLoading(false);
      }
    }, [apiBase]);

    React.useEffect(() => {
      void loadSubmissions();
    }, [loadSubmissions]);

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

    const openSubmissionDetail = async (submissionId) => {
      if (!submissionId) return;
      setDetailLoading(true);
      setSubmissionDetail(null);
      setDetailEditMode(false);
      setEditedLines(null);
      setRejectReason('');
      try {
        const res = await fetch(apiBase + '/api/manufacturing/stock-take-submissions/' + encodeURIComponent(submissionId), {
          method: 'GET',
          headers: authHeaders()
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || res.statusText);
        }
        const data = await res.json();
        setSubmissionDetail(data?.data?.submission || data?.submission || null);
      } catch (e) {
        setError(e.message || 'Failed to load submission detail');
      } finally {
        setDetailLoading(false);
      }
    };

    const beginEditDetail = () => {
      if (!submissionDetail?.lines?.length) return;
      setEditedLines(
        submissionDetail.lines.map((line) => ({
          ...line,
          systemQty: Number(line.systemQty),
          countedQty: Number(line.countedQty)
        }))
      );
      setDetailEditMode(true);
    };

    const cancelEditDetail = () => {
      setDetailEditMode(false);
      setEditedLines(null);
    };

    const removeLineFromEdit = (lineId) => {
      setEditedLines((prev) => {
        if (!prev || prev.length <= 1) return prev;
        return prev.filter((l) => l.id !== lineId);
      });
    };

    const saveAdminLineEdits = async () => {
      if (!submissionDetail?.id || !editedLines?.length) return;
      setDetailSaving(true);
      setError(null);
      setMessage(null);
      try {
        const res = await fetch(
          apiBase + '/api/manufacturing/stock-take-submissions/' + encodeURIComponent(submissionDetail.id),
          {
            method: 'PATCH',
            headers: authHeaders(),
            body: JSON.stringify({ lines: editedLines.map((l) => lineToApiPayload(l)) })
          }
        );
        const txt = await res.text();
        let data = {};
        try {
          data = JSON.parse(txt);
        } catch {}
        if (!res.ok) {
          const msg = data?.error?.message || data?.message || data?.error || txt || res.statusText;
          throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
        }
        const sub = data?.data?.submission || data?.submission;
        if (sub) {
          setSubmissionDetail(sub);
        } else {
          await openSubmissionDetail(submissionDetail.id);
        }
        setDetailEditMode(false);
        setEditedLines(null);
        setMessage('Submission updated.');
        await loadSubmissions();
      } catch (e) {
        setError(e.message || 'Failed to save changes');
      } finally {
        setDetailSaving(false);
      }
    };

    const rejectSubmission = async (submissionId) => {
      if (!submissionId) return;
      let notes = '';
      if (submissionDetail && submissionDetail.id === submissionId) {
        notes = rejectReason.trim();
      } else {
        const p = window.prompt('Optional note for rejection (stored on submission):', '');
        if (p === null) return;
        notes = String(p).trim();
      }
      if (!window.confirm('Reject this submission? It will be marked rejected and removed from the pending list.')) return;
      setRejectBusyId(submissionId);
      setError(null);
      setMessage(null);
      try {
        const res = await fetch(apiBase + '/api/manufacturing/stock-take-submissions/' + encodeURIComponent(submissionId), {
          method: 'PATCH',
          headers: authHeaders(),
          body: JSON.stringify({ status: 'rejected', applyNotes: notes })
        });
        const txt = await res.text();
        let data = {};
        try {
          data = JSON.parse(txt);
        } catch {}
        if (!res.ok) {
          const msg = data?.error?.message || data?.message || data?.error || txt || res.statusText;
          throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
        }
        setMessage('Submission rejected.');
        setSubmissionDetail(null);
        setDetailEditMode(false);
        setEditedLines(null);
        setRejectReason('');
        await loadSubmissions();
      } catch (e) {
        setError(e.message || 'Failed to reject submission');
      } finally {
        setRejectBusyId('');
      }
    };

    const deleteSubmission = async (submissionId) => {
      if (!submissionId) return;
      if (!window.confirm('Permanently delete this submission? This cannot be undone.')) return;
      setDeleteBusyId(submissionId);
      setError(null);
      setMessage(null);
      try {
        const res = await fetch(apiBase + '/api/manufacturing/stock-take-submissions/' + encodeURIComponent(submissionId), {
          method: 'DELETE',
          headers: authHeaders()
        });
        const txt = await res.text();
        let data = {};
        try {
          data = JSON.parse(txt);
        } catch {}
        if (!res.ok) {
          const msg = data?.error?.message || data?.message || data?.error || txt || res.statusText;
          throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
        }
        setMessage('Submission deleted.');
        setSubmissionDetail(null);
        setDetailEditMode(false);
        setEditedLines(null);
        await loadSubmissions();
      } catch (e) {
        setError(e.message || 'Failed to delete submission');
      } finally {
        setDeleteBusyId('');
      }
    };

    const applySubmission = async (submissionId) => {
      if (!submissionId) return;
      if (!window.confirm('Apply this stock-take submission to inventory now?')) return;
      setApplyingSubmissionId(submissionId);
      setError(null);
      setMessage(null);
      try {
        const res = await fetch(apiBase + '/api/manufacturing/stock-take-submissions/' + encodeURIComponent(submissionId) + '/apply', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({})
        });
        const txt = await res.text();
        let data = {};
        try { data = JSON.parse(txt); } catch {}
        if (!res.ok) {
          const msg = data?.error?.message || data?.message || data?.error || txt || res.statusText;
          throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
        }
        const payload = data?.data || {};
        setMessage(
          'Submission applied. Movements created: ' + (payload.movementsCreated ?? 0) + ', skipped: ' + (payload.skipped ?? 0) + '.'
        );
        if (submissionDetail?.id === submissionId) {
          setSubmissionDetail((prev) => prev ? { ...prev, status: 'applied' } : prev);
          setDetailEditMode(false);
          setEditedLines(null);
        }
        await loadSubmissions();
        if (typeof onApplied === 'function') onApplied();
      } catch (e) {
        setError(e.message || 'Failed to apply submission');
      } finally {
        setApplyingSubmissionId('');
      }
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
        ),
      React.createElement(
        'div',
        { className: 'rounded-xl border p-5 shadow-sm ' + card },
        React.createElement('h3', { className: 'text-lg font-semibold ' + text }, 'Pending mobile stock-take submissions'),
        React.createElement(
          'p',
          { className: 'mt-1 text-sm ' + muted },
          'Counts submitted from the Job Cards app appear here for review before apply.'
        ),
        React.createElement(
          'div',
          { className: 'mt-3 flex items-center gap-2' },
          React.createElement(
            'button',
            { type: 'button', disabled: submissionsLoading, className: btn, onClick: () => void loadSubmissions() },
            submissionsLoading ? 'Refreshing…' : 'Refresh'
          )
        ),
        submissionsLoading && submissions.length === 0
          ? React.createElement('div', { className: 'mt-3 text-sm ' + muted }, 'Loading submissions…')
          : null,
        !submissionsLoading && submissions.length === 0
          ? React.createElement('div', { className: 'mt-3 text-sm ' + muted }, 'No pending submissions.')
          : null,
        submissions.length > 0
          ? React.createElement(
              'div',
              { className: 'mt-3 space-y-2' },
              submissions.map((row) =>
                React.createElement(
                  'div',
                  {
                    key: row.id,
                    className:
                      'rounded-lg border px-3 py-2 ' + (isDark ? 'border-gray-700 bg-gray-950/40' : 'border-gray-200 bg-white')
                  },
                  React.createElement(
                    'div',
                    { className: 'flex flex-wrap items-center justify-between gap-2' },
                    React.createElement(
                      'div',
                      { className: 'min-w-0' },
                      React.createElement('p', { className: 'text-sm font-semibold ' + text }, row.submissionRef || row.id),
                      React.createElement(
                        'p',
                        { className: 'text-xs ' + muted },
                        (row.locationName || 'Unknown location') +
                          ' · ' +
                          (row.lineCount || 0) +
                          ' lines · by ' +
                          (row.submittedBy || 'Unknown')
                      )
                    ),
                    React.createElement(
                      'div',
                      { className: 'flex flex-wrap gap-2 justify-end' },
                      React.createElement(
                        'button',
                        { type: 'button', className: btn, onClick: () => void openSubmissionDetail(row.id) },
                        'Review'
                      ),
                      React.createElement(
                        'button',
                        {
                          type: 'button',
                          className: btnPrimary,
                          disabled: applyingSubmissionId === row.id,
                          onClick: () => void applySubmission(row.id)
                        },
                        applyingSubmissionId === row.id ? 'Applying…' : 'Apply'
                      ),
                      React.createElement(
                        'button',
                        {
                          type: 'button',
                          className: btnDanger,
                          disabled: rejectBusyId === row.id || deleteBusyId === row.id,
                          onClick: () => void rejectSubmission(row.id)
                        },
                        rejectBusyId === row.id ? '…' : 'Reject'
                      ),
                      React.createElement(
                        'button',
                        {
                          type: 'button',
                          className: btnDanger,
                          disabled: deleteBusyId === row.id || rejectBusyId === row.id,
                          onClick: () => void deleteSubmission(row.id)
                        },
                        deleteBusyId === row.id ? '…' : 'Delete'
                      )
                    )
                  )
                )
              )
            )
          : null,
        detailLoading
          ? React.createElement('div', { className: 'mt-3 text-xs ' + muted }, 'Loading selected submission detail…')
          : null,
        submissionDetail
          ? (() => {
              const pending = submissionDetail.status === 'pending_review';
              const tableLines =
                detailEditMode && editedLines && editedLines.length ? editedLines : submissionDetail.lines || [];
              const headers =
                detailEditMode && editedLines && editedLines.length
                  ? ['SKU', 'Name', 'System', 'Counted', 'Delta', '']
                  : ['SKU', 'Name', 'System', 'Counted', 'Delta'];
              return React.createElement(
                'div',
                {
                  className:
                    'mt-4 rounded-lg border p-3 ' + (isDark ? 'border-gray-700 bg-gray-950/50' : 'border-gray-200 bg-gray-50')
                },
                React.createElement(
                  'div',
                  { className: 'flex flex-wrap items-start justify-between gap-2' },
                  React.createElement(
                    'div',
                    null,
                    React.createElement(
                      'p',
                      { className: 'text-sm font-semibold ' + text },
                      'Review: ' + (submissionDetail.submissionRef || submissionDetail.id)
                    ),
                    React.createElement(
                      'p',
                      { className: 'text-xs mt-1 ' + muted },
                      (submissionDetail.locationName || '') +
                        ' · submitted ' +
                        new Date(submissionDetail.submittedAt || Date.now()).toLocaleString() +
                        (submissionDetail.status && submissionDetail.status !== 'pending_review'
                          ? ' · status: ' + submissionDetail.status
                          : '')
                    )
                  ),
                  pending
                    ? React.createElement(
                        'div',
                        { className: 'flex flex-wrap gap-2 justify-end' },
                        !detailEditMode
                          ? React.createElement(
                              'button',
                              {
                                type: 'button',
                                className: btnPrimary,
                                disabled: applyingSubmissionId === submissionDetail.id,
                                onClick: () => void applySubmission(submissionDetail.id)
                              },
                              applyingSubmissionId === submissionDetail.id ? 'Applying…' : 'Apply'
                            )
                          : null,
                        !detailEditMode
                          ? React.createElement(
                              'button',
                              { type: 'button', className: btn, onClick: beginEditDetail },
                              'Edit lines'
                            )
                          : null,
                        detailEditMode
                          ? React.createElement(
                              'button',
                              {
                                type: 'button',
                                className: btnPrimary,
                                disabled: detailSaving,
                                onClick: () => void saveAdminLineEdits()
                              },
                              detailSaving ? 'Saving…' : 'Save changes'
                            )
                          : null,
                        detailEditMode
                          ? React.createElement(
                              'button',
                              { type: 'button', className: btn, disabled: detailSaving, onClick: cancelEditDetail },
                              'Cancel'
                            )
                          : null,
                        !detailEditMode
                          ? React.createElement(
                              'button',
                              {
                                type: 'button',
                                className: btnDanger,
                                disabled: rejectBusyId === submissionDetail.id || deleteBusyId === submissionDetail.id,
                                onClick: () => void rejectSubmission(submissionDetail.id)
                              },
                              rejectBusyId === submissionDetail.id ? '…' : 'Reject'
                            )
                          : null,
                        !detailEditMode
                          ? React.createElement(
                              'button',
                              {
                                type: 'button',
                                className: btnDanger,
                                disabled: deleteBusyId === submissionDetail.id || rejectBusyId === submissionDetail.id,
                                onClick: () => void deleteSubmission(submissionDetail.id)
                              },
                              deleteBusyId === submissionDetail.id ? '…' : 'Delete'
                            )
                          : null
                      )
                    : null
                ),
                pending && !detailEditMode
                  ? React.createElement(
                      'div',
                      { className: 'mt-3 max-w-lg' },
                      React.createElement(
                        'label',
                        { className: 'block text-xs font-medium ' + muted },
                        'Rejection note (optional)'
                      ),
                      React.createElement('textarea', {
                        className:
                          'mt-1 w-full rounded border px-2 py-1.5 text-sm ' +
                          (isDark ? 'border-gray-600 bg-gray-900 text-gray-100' : 'border-gray-300 bg-white text-gray-900'),
                        rows: 2,
                        value: rejectReason,
                        onChange: (e) => setRejectReason(e.target.value),
                        placeholder: 'Shown on the submission record when rejected.'
                      })
                    )
                  : null,
                React.createElement(
                  'div',
                  { className: 'mt-2 overflow-x-auto max-h-96' },
                  React.createElement(
                    'table',
                    { className: 'w-full text-xs' },
                    React.createElement(
                      'thead',
                      null,
                      React.createElement(
                        'tr',
                        { className: isDark ? 'bg-gray-800' : 'bg-gray-100' },
                        headers.map((h, hi) =>
                          React.createElement('th', { key: 'h-' + hi, className: 'text-left px-2 py-1 font-medium ' + muted }, h)
                        )
                      )
                    ),
                    React.createElement(
                      'tbody',
                      null,
                      tableLines.slice(0, 100).map((line) => {
                        const meta = parseLineMeta(line);
                        const isNewItem = meta?.isNewItem === true;
                        const proposed =
                          meta?.proposedItemDetails && typeof meta.proposedItemDetails === 'object'
                            ? meta.proposedItemDetails
                            : {};
                        const showEdit = detailEditMode && editedLines && editedLines.length;
                        const deltaShow = showEdit
                          ? Number(line.countedQty || 0) - Number(line.systemQty || 0)
                          : Number(line.deltaQty || 0);
                        return React.createElement(
                          'tr',
                          { key: line.id, className: isDark ? 'border-t border-gray-800' : 'border-t border-gray-200' },
                          React.createElement(
                            'td',
                            { className: 'px-2 py-1 align-top ' + text },
                            isNewItem ? meta?.proposedSku || line.sku || 'AUTO' : line.sku
                          ),
                          showEdit
                            ? React.createElement(
                                'td',
                                { className: 'px-2 py-1 align-top min-w-[8rem]' },
                                React.createElement('input', {
                                  type: 'text',
                                  className: inputCell + ' max-w-[14rem]',
                                  value: line.itemName || '',
                                  onChange: (e) =>
                                    setEditedLines((prev) =>
                                      prev
                                        ? prev.map((l) =>
                                            l.id === line.id ? { ...l, itemName: e.target.value } : l
                                          )
                                        : prev
                                    )
                                }),
                                isNewItem
                                  ? React.createElement(
                                      'span',
                                      {
                                        className:
                                          'ml-1 inline-flex items-center rounded px-1 py-0.5 text-[10px] font-semibold ' +
                                          (isDark ? 'bg-amber-900/50 text-amber-200' : 'bg-amber-100 text-amber-800')
                                      },
                                      'NEW'
                                    )
                                  : null
                              )
                            : React.createElement(
                                'td',
                                { className: 'px-2 py-1 ' + text },
                                (line.itemName || '').slice(0, 42),
                                isNewItem
                                  ? React.createElement(
                                      'span',
                                      {
                                        className:
                                          'ml-1 inline-flex items-center rounded px-1 py-0.5 text-[10px] font-semibold ' +
                                          (isDark ? 'bg-amber-900/50 text-amber-200' : 'bg-amber-100 text-amber-800')
                                      },
                                      'NEW ITEM'
                                    )
                                  : null,
                                isNewItem &&
                                (proposed?.supplier || proposed?.supplierPartNumber || proposed?.manufacturingPartNumber)
                                  ? React.createElement(
                                      'div',
                                      { className: 'text-[10px] mt-0.5 ' + muted },
                                      'Supplier: ' +
                                        (proposed?.supplier || '—') +
                                        ' · Supplier Part: ' +
                                        (proposed?.supplierPartNumber || '—') +
                                        ' · Mfg Part: ' +
                                        (proposed?.manufacturingPartNumber || '—')
                                    )
                                  : null
                              ),
                          React.createElement(
                            'td',
                            { className: 'px-2 py-1 ' + text },
                            Number(line.systemQty || 0).toFixed(2)
                          ),
                          showEdit
                            ? React.createElement(
                                'td',
                                { className: 'px-2 py-1 align-top' },
                                React.createElement('input', {
                                  type: 'number',
                                  step: 'any',
                                  className: inputCell,
                                  value: Number(line.countedQty || 0),
                                  onChange: (e) => {
                                    const v = parseFloat(e.target.value);
                                    const n = Number.isFinite(v) ? v : 0;
                                    setEditedLines((prev) =>
                                      prev
                                        ? prev.map((l) => (l.id === line.id ? { ...l, countedQty: n } : l))
                                        : prev
                                    );
                                  }
                                })
                              )
                            : React.createElement(
                                'td',
                                { className: 'px-2 py-1 ' + text },
                                Number(line.countedQty || 0).toFixed(2)
                              ),
                          React.createElement(
                            'td',
                            { className: 'px-2 py-1 ' + text },
                            Number(deltaShow).toFixed(2)
                          ),
                          showEdit
                            ? React.createElement(
                                'td',
                                { className: 'px-2 py-1 align-top whitespace-nowrap' },
                                React.createElement(
                                  'button',
                                  {
                                    type: 'button',
                                    className: btn + ' text-xs py-1 px-2',
                                    disabled: (editedLines || []).length <= 1,
                                    onClick: () => removeLineFromEdit(line.id)
                                  },
                                  'Remove'
                                )
                              )
                            : null
                        );
                      })
                    )
                  )
                )
              );
            })()
          : null
      )
    );
  }

  window.StockCountView = StockCountView;
})();
