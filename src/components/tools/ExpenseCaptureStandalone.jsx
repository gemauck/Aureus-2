/**
 * Full-screen Expense Capture for direct links (authenticated), similar to /job-card layout
 * without the main ERP chrome — optimized for mobile camera use.
 * Open at /expense-capture or /expense
 */
const { useMemo } = React;

function hasToolsAccess() {
  try {
    if (!window.PERMISSIONS || !window.permissionChecker?.hasPermission) return true;
    return window.permissionChecker.hasPermission(window.PERMISSIONS.ACCESS_TOOL);
  } catch {
    return true;
  }
}

function ExpenseCaptureStandalone() {
  const { isDark } = window.useTheme?.() || { isDark: false };
  const allowed = useMemo(() => hasToolsAccess(), []);

  const goDashboard = () => {
    try {
      if (window.RouteState?.setPageSubpath) {
        window.RouteState.setPageSubpath('dashboard', [], { replace: false });
      } else {
        window.location.href = '/';
      }
    } catch {
      window.location.href = '/';
    }
  };

  const goToolsExpense = () => {
    try {
      if (window.RouteState?.setPageSubpath) {
        window.RouteState.setPageSubpath('tools', ['expense-capture'], { replace: false });
      } else {
        window.location.href = '/tools/expense-capture';
      }
    } catch {
      window.location.href = '/tools/expense-capture';
    }
  };

  if (!allowed) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center p-6 ${isDark ? 'bg-gray-950 text-gray-100' : 'bg-gray-50 text-gray-900'}`}
      >
        <div className="max-w-sm text-center space-y-4">
          <i className="fas fa-lock text-3xl text-amber-500" aria-hidden />
          <p className="text-sm">You do not have access to Staff Tools (including Expense Capture).</p>
          <button
            type="button"
            onClick={goDashboard}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium"
          >
            Go to dashboard
          </button>
        </div>
      </div>
    );
  }

  const Tool = window.ExpenseCaptureTool || window.ReceiptCaptureTool;
  if (!Tool) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-gray-950' : 'bg-gray-100'}`}>
        <div className="text-center px-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4" />
          <p className={isDark ? 'text-gray-300' : 'text-gray-600'}>Loading Expense Capture…</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col ${isDark ? 'bg-gray-950 text-gray-100' : 'bg-gray-100 text-gray-900'}`}>
      <header
        className={`shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b ${
          isDark ? 'border-gray-800 bg-gray-900/95' : 'border-gray-200 bg-white/95'
        } backdrop-blur-sm`}
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <button
          type="button"
          onClick={goDashboard}
          className={`flex items-center gap-2 text-sm font-medium rounded-lg px-2 py-1.5 -ml-2 ${
            isDark ? 'text-gray-200 hover:bg-gray-800' : 'text-gray-800 hover:bg-gray-100'
          }`}
        >
          <i className="fas fa-arrow-left text-xs" aria-hidden />
          ERP
        </button>
        <span className="text-sm font-semibold truncate">Expense Capture</span>
        <button
          type="button"
          onClick={goToolsExpense}
          className={`text-xs font-medium px-2 py-1 rounded-lg ${isDark ? 'text-emerald-400 hover:bg-gray-800' : 'text-emerald-700 hover:bg-emerald-50'}`}
        >
          In Tools
        </button>
      </header>
      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 sm:p-4 w-full max-w-lg mx-auto">
        <Tool />
      </main>
    </div>
  );
}

window.ExpenseCaptureStandalone = ExpenseCaptureStandalone;
