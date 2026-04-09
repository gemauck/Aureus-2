/**
 * Direct-link entry for PO from document (authenticated). Loaded at /po-from-document or /po-document.
 */
const { useState, useEffect, useCallback } = React;

function PurchaseOrderFromDocumentStandalone() {
  const { isDark } = window.useTheme ? window.useTheme() : { isDark: false };
  const [suppliers, setSuppliers] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [stockLocations, setStockLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const safeCallAPI = useCallback(async (methodName, ...args) => {
    if (!window.DatabaseAPI || typeof window.DatabaseAPI[methodName] !== 'function') {
      throw new Error(`DatabaseAPI.${methodName} is not available`);
    }
    return window.DatabaseAPI[methodName](...args);
  }, []);

  const goToPurchaseOrders = useCallback(() => {
    try {
      if (window.RouteState && typeof window.RouteState.setPageSubpath === 'function') {
        window.RouteState.setPageSubpath('manufacturing', ['purchase'], { replace: true });
      } else {
        window.location.replace('/manufacturing/purchase');
      }
    } catch (e) {
      window.location.href = '/';
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadError(null);
      if (!window.DatabaseAPI) {
        setLoadError('Application is still loading. Refresh the page.');
        setLoading(false);
        return;
      }
      try {
        const [supRes, invRes, locRes] = await Promise.all([
          safeCallAPI('getSuppliers'),
          safeCallAPI('getInventory', null, { forceRefresh: true }),
          safeCallAPI('getStockLocations')
        ]);
        if (cancelled) return;
        const sups = supRes?.data?.suppliers || [];
        const inv = invRes?.data?.inventory || [];
        const locsRaw = locRes?.data?.locations || [];
        const sorted = window.manufacturingStockLocations?.sortStockLocationsForManufacturing
          ? window.manufacturingStockLocations.sortStockLocationsForManufacturing(locsRaw)
          : Array.isArray(locsRaw)
            ? [...locsRaw]
            : [];
        setSuppliers(Array.isArray(sups) ? sups : []);
        setInventory(Array.isArray(inv) ? inv.map((x) => ({ ...x, id: x.id })) : []);
        setStockLocations(sorted);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err?.message || 'Failed to load manufacturing data');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [safeCallAPI]);

  const defaultReceivingLocationId = (() => {
    const fn = window.manufacturingStockLocations?.getDefaultManufacturingStockLocation;
    if (fn && stockLocations.length) return fn(stockLocations)?.id || null;
    return stockLocations[0]?.id || null;
  })();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center px-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-700 dark:text-gray-300 text-sm">Loading PO from document…</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
        <div className="max-w-md text-center space-y-4">
          <p className="text-red-700 dark:text-red-400 text-sm">{loadError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm"
          >
            Retry
          </button>
          <div>
            <button type="button" onClick={goToPurchaseOrders} className="text-sm text-blue-600 underline">
              Go to Purchase Orders
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!window.PurchaseOrderFromDocumentWizard) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <p className="text-gray-600 dark:text-gray-400 text-sm">Loading wizard…</p>
      </div>
    );
  }

  return window.React.createElement(window.PurchaseOrderFromDocumentWizard, {
    onClose: goToPurchaseOrders,
    onCreated: () => {
      alert(
        'Purchase order created as Draft. Finalize it, mark as Sent, then confirm goods receipt to update inventory.'
      );
      goToPurchaseOrders();
    },
    suppliers,
    inventory,
    stockLocations,
    defaultReceivingLocationId,
    safeCallAPI,
    isDark
  });
}

window.PurchaseOrderFromDocumentStandalone = PurchaseOrderFromDocumentStandalone;
