import { useEffect, useState } from 'react';
import type { Supplier, PurchaseInvoice, Product } from '@shared/types';

type FormMode = 'create' | 'view';

interface ItemRow {
  product_id?: number;
  product_name?: string;
  qty: number;
  rate: number;
  gst_rate: number;
}

interface PurchaseInvoiceModalProps {
  mode: FormMode;
  invoice: PurchaseInvoice | null;
  suppliers: Supplier[];
  products: Product[];
  onClose: () => void;
  onSave: (data: {
    invoice_no?: string;
    invoice_date: string;
    supplier_id: number;
    notes?: string;
    items: Array<{ product_id?: number; product_name?: string; qty: number; rate: number; gst_rate: number }>;
  }) => Promise<{ success: boolean; error?: string }>;
  onDelete: (id: number) => Promise<{ success: boolean; error?: string }>;
}

const emptyForm = {
  invoice_no: '',
  invoice_date: new Date().toISOString().slice(0, 10),
  supplier_id: '',
  notes: ''
};

export default function PurchaseInvoiceModal({
  mode,
  invoice,
  suppliers,
  products,
  onClose,
  onSave,
  onDelete
}: PurchaseInvoiceModalProps) {
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (mode === 'create') {
      setForm({
        ...emptyForm,
        invoice_date: new Date().toISOString().slice(0, 10),
        supplier_id: suppliers.length > 0 ? String(suppliers[0].id) : ''
      });
      setItems([]);
    } else if (invoice) {
      setForm({
        invoice_no: invoice.invoice_no,
        invoice_date: invoice.invoice_date,
        supplier_id: String(invoice.supplier_id),
        notes: invoice.notes || ''
      });
      setError('');
      window.electronAPI.getPurchaseInvoiceItems(invoice.id).then((fetchedItems) => {
        setItems(
          fetchedItems.map((item) => ({
            product_id: item.product_id,
            product_name: item.product_name || '',
            qty: item.qty,
            rate: item.rate,
            gst_rate: item.gst_rate || 0
          }))
        );
      });
    }
  }, [mode, invoice, suppliers]);

  function addItem() {
    setItems([...items, { product_id: undefined, product_name: '', qty: 1, rate: 0, gst_rate: 0 }]);
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof ItemRow, value: number | undefined | string) {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };

    if (field === 'product_id' && typeof value === 'number') {
      const product = products.find((p) => p.id === value);
      if (product) {
        updated[index].product_name = product.name;
        updated[index].rate = product.purchase_rate || 0;
        updated[index].gst_rate = product.gst_rate || 0;
      }
    }

    setItems(updated);
  }

  function calcTotals() {
    let subtotal = 0;
    let taxAmount = 0;
    for (const item of items) {
      const amt = item.qty * item.rate;
      subtotal += amt;
      taxAmount += item.gst_rate ? (amt * item.gst_rate) / 100 : 0;
    }
    const selectedSupplier = suppliers.find((s) => s.id === parseInt(form.supplier_id, 10));
    const companyState = (window as any).__companyState || '';
    const supplierState = selectedSupplier?.state || '';
    const isIntraState = supplierState && companyState && supplierState.toLowerCase() === companyState.toLowerCase();
    let cgst = 0, sgst = 0, igst = 0;
    if (taxAmount > 0) {
      if (isIntraState) {
        cgst = Math.round((taxAmount / 2) * 100) / 100;
        sgst = taxAmount - cgst;
      } else {
        igst = taxAmount;
      }
    }
    return { subtotal, taxAmount, cgst, sgst, igst, total: subtotal + taxAmount };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const supplierId = parseInt(form.supplier_id, 10);

    if (!supplierId) {
      setError('Select a supplier');
      return;
    }
    if (!form.invoice_date) {
      setError('Invoice date is required');
      return;
    }

    const { total } = calcTotals();

    if (items.length === 0 || total <= 0) {
      setError('Add at least one item with valid quantity and rate');
      return;
    }

    const payload = {
      invoice_no: form.invoice_no.trim() || undefined,
      invoice_date: form.invoice_date,
      supplier_id: supplierId,
      notes: form.notes.trim() || undefined,
      items: items.map((item) => ({
        product_id: item.product_id,
        product_name: item.product_name,
        qty: item.qty,
        rate: item.rate,
        gst_rate: item.gst_rate
      }))
    };

    setSaving(true);
    const res = await onSave(payload);
    setSaving(false);

    if (!res.success) {
      setError(res.error || 'Could not save purchase invoice');
      return;
    }

    onClose();
  }

  async function handleDelete() {
    if (!invoice || !confirm('Delete this purchase invoice? Stock will be reduced. This cannot be undone.')) return;
    const res = await onDelete(invoice.id);
    if (!res.success) {
      setError(res.error || 'Could not delete purchase invoice');
      return;
    }
    onClose();
  }

  const { subtotal, taxAmount, cgst, sgst, igst, total } = calcTotals();
  const selectedSupplier = suppliers.find((s) => s.id === parseInt(form.supplier_id, 10));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            {mode === 'create' ? 'New Purchase Invoice' : 'View Purchase Invoice'}
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="alert alert-error">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="modal-form-row">
              <div className="form-group">
                <label>Invoice no.</label>
                <input
                  placeholder="Auto-generated if empty"
                  value={form.invoice_no}
                  onChange={(e) => setForm({ ...form, invoice_no: e.target.value })}
                  readOnly={mode === 'view'}
                />
              </div>
              <div className="form-group">
                <label>Date *</label>
                <input
                  type="date"
                  value={form.invoice_date}
                  onChange={(e) => setForm({ ...form, invoice_date: e.target.value })}
                  required
                  readOnly={mode === 'view'}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Supplier *</label>
              <select
                value={form.supplier_id}
                onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
                required
                disabled={mode === 'view'}
              >
                <option value="">Select supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {selectedSupplier && (
                <p className="customer-balance">
                  Outstanding payable: <strong>{selectedSupplier.current_balance.toLocaleString('en-IN')}</strong>
                </p>
              )}
            </div>

            <div className="items-section">
              <div className="items-header">
                <label className="items-label">Items</label>
                {mode !== 'view' && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={addItem}>
                    + Add item
                  </button>
                )}
              </div>

              {items.length > 0 && (
                <div className="items-table-wrapper">
                  <table className="items-table">
                    <thead>
                      <tr>
                        <th className="col-product">Product</th>
                        <th className="col-qty">Qty</th>
                        <th className="col-rate">Rate</th>
                        <th className="col-gst">GST%</th>
                        <th className="col-amount">Amount</th>
                        {mode !== 'view' && <th className="col-action"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => {
                        const amt = item.qty * item.rate;
                        return (
                          <tr key={idx}>
                            <td className="col-product">
                              {mode === 'view' ? (
                                <span className="product-name">{item.product_name || '—'}</span>
                              ) : (
                                <select
                                  value={item.product_id || ''}
                                  onChange={(e) => updateItem(idx, 'product_id', parseInt(e.target.value, 10))}
                                >
                                  <option value="">Select product</option>
                                  {products.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </td>
                            <td className="col-qty">
                              {mode === 'view' ? (
                                <span className="text-right">{item.qty}</span>
                              ) : (
                                <input
                                  type="number"
                                  min="1"
                                  value={item.qty}
                                  onChange={(e) => updateItem(idx, 'qty', parseInt(e.target.value, 10) || 0)}
                                />
                              )}
                            </td>
                            <td className="col-rate">
                              {mode === 'view' ? (
                                <span className="text-right">{item.rate.toFixed(2)}</span>
                              ) : (
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={item.rate}
                                  onChange={(e) => updateItem(idx, 'rate', parseFloat(e.target.value) || 0)}
                                />
                              )}
                            </td>
                            <td className="col-gst">
                              {mode === 'view' ? (
                                <span className="text-right">{item.gst_rate}</span>
                              ) : (
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={item.gst_rate}
                                  onChange={(e) => updateItem(idx, 'gst_rate', parseFloat(e.target.value) || 0)}
                                />
                              )}
                            </td>
                            <td className="col-amount text-right">₹{amt.toFixed(2)}</td>
                            {mode !== 'view' && (
                              <td className="col-action">
                                <button type="button" className="btn-remove" onClick={() => removeItem(idx)}>
                                  ×
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {items.length > 0 && (
                <div className="totals-section">
                  <div className="total-row">
                    <span>Subtotal:</span>
                    <span>₹{subtotal.toFixed(2)}</span>
                  </div>
                  {cgst > 0 && (
                    <div className="total-row">
                      <span>CGST:</span>
                      <span>₹{cgst.toFixed(2)}</span>
                    </div>
                  )}
                  {sgst > 0 && (
                    <div className="total-row">
                      <span>SGST:</span>
                      <span>₹{sgst.toFixed(2)}</span>
                    </div>
                  )}
                  {igst > 0 && (
                    <div className="total-row">
                      <span>IGST:</span>
                      <span>₹{igst.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="total-row total-final">
                    <span>Total:</span>
                    <span>₹{total.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="form-group">
              <label>Notes</label>
              <input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                readOnly={mode === 'view'}
                placeholder="Add notes..."
              />
            </div>

            {invoice && (
              <p className="invoice-outstanding">
                Outstanding: <strong>₹{invoice.total_remaining.toLocaleString('en-IN')}</strong>
              </p>
            )}
          </form>
        </div>

        <div className="modal-footer">
          {mode === 'view' ? (
            <>
              <button type="button" className="btn btn-danger" onClick={handleDelete}>
                Delete
              </button>
              <div className="footer-spacer" />
              <button type="button" className="btn" onClick={onClose}>
                Close
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn" disabled={saving} onClick={(e) => handleSubmit(e as any)}>
                {saving ? 'Saving…' : 'Create Purchase Invoice'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
