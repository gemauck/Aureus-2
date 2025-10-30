// Stock Transactions Tab - receipts, transfers, sales, adjustments
const { useState, useEffect } = React;

const StockTransactions = () => {
  const [inventory, setInventory] = useState([]);
  const [locations, setLocations] = useState([]);
  const [activeType, setActiveType] = useState('receipt'); // receipt | transfer | sale | adjustment
  const [form, setForm] = useState({ quantity: '', sku: '', itemName: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [movements, setMovements] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const inv = await window.api.fetchJson('/api/manufacturing/inventory');
        setInventory(inv?.data?.inventory || []);
      } catch (_) {}
      try {
        const loc = await window.api.fetchJson('/api/manufacturing/locations');
        setLocations(loc?.data?.locations || []);
      } catch (_) {}
      try {
        const mov = await window.api.fetchJson('/api/manufacturing/stock-movements');
        setMovements(mov?.data?.movements || []);
      } catch (_) {}
    };
    load();
  }, []);

  const onChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const onSelectSku = (sku) => {
    const item = inventory.find(i => i.sku === sku);
    if (item) setForm(prev => ({ ...prev, sku, itemName: item.name }));
  };

  const submit = async (e) => {
    e?.preventDefault?.();
    if (submitting) return;
    const qty = parseFloat(form.quantity);
    if (!form.sku || !form.itemName || !(qty > 0)) {
      alert('Please provide SKU, Item Name, and positive Quantity');
      return;
    }
    try {
      setSubmitting(true);
      const payload = {
        type: activeType,
        sku: form.sku,
        itemName: form.itemName,
        quantity: qty,
        unitCost: form.unitCost ? parseFloat(form.unitCost) : undefined,
        fromLocationId: form.fromLocationId || undefined,
        toLocationId: form.toLocationId || undefined,
        notes: form.notes || ''
      };
      const res = await (window.DatabaseAPI?.createStockTransaction ? window.DatabaseAPI.createStockTransaction(payload) : window.api.postJson('/api/manufacturing/stock-transactions', payload));
      if (res?.data?.movement) {
        setMovements(m => [res.data.movement, ...m]);
        // Refresh inventory overview
        try {
          const inv = await window.api.fetchJson('/api/manufacturing/inventory');
          setInventory(inv?.data?.inventory || []);
        } catch (_) {}
        alert('Transaction recorded');
        setForm({ quantity: '', sku: '', itemName: '', notes: '' });
      }
    } catch (err) {
      alert(err?.response?.data?.error || err.message || 'Failed to record transaction');
    } finally {
      setSubmitting(false);
    }
  };

  const SkuPicker = () => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div>
        <label className="block text-sm font-medium">SKU</label>
        <input className="mt-1 w-full border rounded px-3 py-2" value={form.sku} onChange={e => { onChange('sku', e.target.value); onSelectSku(e.target.value); }} placeholder="SKU0001" />
      </div>
      <div>
        <label className="block text-sm font-medium">Item Name</label>
        <input className="mt-1 w-full border rounded px-3 py-2" value={form.itemName} onChange={e => onChange('itemName', e.target.value)} placeholder="Diesel Filter" />
      </div>
      <div>
        <label className="block text-sm font-medium">Quantity</label>
        <input type="number" step="0.01" className="mt-1 w-full border rounded px-3 py-2" value={form.quantity} onChange={e => onChange('quantity', e.target.value)} placeholder="10" />
      </div>
    </div>
  );

  const LocationSelect = ({ field, label }) => (
    <div>
      <label className="block text-sm font-medium">{label}</label>
      <select className="mt-1 w-full border rounded px-3 py-2" value={form[field] || ''} onChange={e => onChange(field, e.target.value)}>
        <option value="">Select location</option>
        {locations.map(l => (
          <option key={l.id} value={l.id}>{l.code} - {l.name}</option>
        ))}
      </select>
    </div>
  );

  const ReceiptForm = () => (
    <div className="space-y-4">
      <SkuPicker />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <LocationSelect field="toLocationId" label="To Location" />
        <div>
          <label className="block text-sm font-medium">Unit Cost</label>
          <input type="number" step="0.01" className="mt-1 w-full border rounded px-3 py-2" value={form.unitCost || ''} onChange={e => onChange('unitCost', e.target.value)} placeholder="0.00" />
        </div>
      </div>
    </div>
  );

  const TransferForm = () => (
    <div className="space-y-4">
      <SkuPicker />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <LocationSelect field="fromLocationId" label="From Location" />
        <LocationSelect field="toLocationId" label="To Location" />
      </div>
    </div>
  );

  const SaleForm = () => (
    <div className="space-y-4">
      <SkuPicker />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <LocationSelect field="fromLocationId" label="Location" />
        <div>
          <label className="block text-sm font-medium">Reference</label>
          <input className="mt-1 w-full border rounded px-3 py-2" value={form.reference || ''} onChange={e => onChange('reference', e.target.value)} placeholder="Invoice/Order" />
        </div>
      </div>
    </div>
  );

  const AdjustmentForm = () => (
    <div className="space-y-4">
      <SkuPicker />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <LocationSelect field="locationId" label="Location" />
        <div>
          <label className="block text-sm font-medium">Adjustment (use negative to reduce)</label>
          <input type="number" step="0.01" className="mt-1 w-full border rounded px-3 py-2" value={form.delta || ''} onChange={e => onChange('delta', e.target.value)} placeholder="-1" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-4">Stock Transactions</h2>
      <div className="mb-4 inline-flex rounded overflow-hidden border">
        {['receipt','transfer','sale','adjustment'].map(t => (
          <button key={t} className={`px-4 py-2 ${activeType===t?'bg-primary-500 text-white':'bg-white'}`} onClick={() => setActiveType(t)}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>
        ))}
      </div>

      <form className="space-y-4" onSubmit={submit}>
        {activeType === 'receipt' && <ReceiptForm />}
        {activeType === 'transfer' && <TransferForm />}
        {activeType === 'sale' && <SaleForm />}
        {activeType === 'adjustment' && <AdjustmentForm />}

        <div>
          <label className="block text-sm font-medium">Notes</label>
          <textarea className="mt-1 w-full border rounded px-3 py-2" rows={2} value={form.notes} onChange={e => onChange('notes', e.target.value)} />
        </div>

        <button type="submit" disabled={submitting} className="px-4 py-2 rounded bg-primary-500 text-white disabled:opacity-50">
          {submitting ? 'Saving...' : 'Record Transaction'}
        </button>
      </form>

      <div className="mt-8">
        <h3 className="font-semibold mb-2">Recent Movements</h3>
        <div className="overflow-x-auto bg-white rounded border">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">Type</th>
                <th className="text-left px-3 py-2">SKU</th>
                <th className="text-left px-3 py-2">Item</th>
                <th className="text-right px-3 py-2">Qty</th>
                <th className="text-left px-3 py-2">From</th>
                <th className="text-left px-3 py-2">To</th>
              </tr>
            </thead>
            <tbody>
              {movements.map(m => (
                <tr key={m.id || m.movementId} className="border-t">
                  <td className="px-3 py-2">{m.date}</td>
                  <td className="px-3 py-2">{m.type}</td>
                  <td className="px-3 py-2">{m.sku}</td>
                  <td className="px-3 py-2">{m.itemName}</td>
                  <td className="px-3 py-2 text-right">{m.quantity}</td>
                  <td className="px-3 py-2">{m.fromLocation}</td>
                  <td className="px-3 py-2">{m.toLocation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

try {
  window.StockTransactions = StockTransactions;
} catch (e) {}


