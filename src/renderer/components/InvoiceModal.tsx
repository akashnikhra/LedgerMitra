import { useEffect, useState } from 'react';
import type { Customer, Invoice, Product } from '@shared/types';
import SearchableSelect from './SearchableSelect';

type FormMode = 'create' | 'edit' | 'view';

interface ItemRow {
  product_id?: number;
  product_name?: string;
  qty: number;
  rate: number;
  gst_rate: number;
}

interface InvoiceModalProps {
  mode: FormMode;
  invoice: Invoice | null;
  customers: Customer[];
  products: Product[];
  onClose: () => void;
  onSave: (data: {
    invoice_no?: string;
    invoice_date: string;
    customer_id: number;
    invoice_type?: string;
    notes?: string;
    items: Array<{ product_id?: number; product_name?: string; qty: number; rate: number; gst_rate: number }>;
  }) => Promise<{ success: boolean; error?: string }>;
  onDelete: (id: number) => Promise<{ success: boolean; error?: string }>;
  onEdit?: () => void;
}

const emptyForm = {
  invoice_no: '',
  invoice_date: new Date().toISOString().slice(0, 10),
  customer_id: '',
  invoice_type: 'SALE',
  notes: ''
};

export default function InvoiceModal({
  mode,
  invoice,
  customers,
  products,
  onClose,
  onSave,
  onDelete,
  onEdit
}: InvoiceModalProps) {
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (mode === 'create') {
      setForm({
        ...emptyForm,
        invoice_date: new Date().toISOString().slice(0, 10),
        customer_id: customers.length > 0 ? String(customers[0].id) : ''
      });
      setItems([]);
    } else if (invoice) {
      setForm({
        invoice_no: invoice.invoice_no,
        invoice_date: invoice.invoice_date,
        customer_id: String(invoice.customer_id),
        invoice_type: invoice.invoice_type || 'SALE',
        notes: invoice.notes || ''
      });
      setError('');
      window.electronAPI.getInvoiceItems(invoice.id).then((fetchedItems) => {
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
  }, [mode, invoice, customers]);

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
        updated[index].rate = product.selling_rate || 0;
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
    const selectedCustomer = customers.find((c) => c.id === parseInt(form.customer_id, 10));
    const companyState = (window as any).__companyState || '';
    const customerState = selectedCustomer?.state || '';
    const isIntraState = customerState && companyState && customerState.toLowerCase() === companyState.toLowerCase();
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

    const customerId = parseInt(form.customer_id, 10);

    if (!customerId) {
      setError('Select a customer');
      return;
    }
    if (!form.invoice_date) {
      setError('Invoice date is required');
      return;
    }

    const { subtotal, total } = calcTotals();

    if (items.length > 0 && total <= 0) {
      setError('Enter valid item quantities and rates');
      return;
    }
    if (items.length === 0) {
      setError('Add at least one item');
      return;
    }

    const payload = {
      invoice_no: form.invoice_no.trim() || undefined,
      invoice_date: form.invoice_date,
      customer_id: customerId,
      invoice_type: form.invoice_type,
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
      setError(res.error || 'Could not save invoice');
      return;
    }

    onClose();
  }

  async function handleDelete() {
    if (!invoice || !confirm('Delete this invoice? This cannot be undone.')) return;
    const res = await onDelete(invoice.id);
    if (!res.success) {
      setError(res.error || 'Could not delete invoice');
      return;
    }
    onClose();
  }

  const { subtotal, taxAmount, cgst, sgst, igst, total } = calcTotals();
  const selectedCustomer = customers.find((c) => c.id === parseInt(form.customer_id, 10));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            {mode === 'create' ? 'New Invoice' : mode === 'edit' ? 'Edit Invoice' : 'View Invoice'}
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

          <form id="invoice-form" onSubmit={handleSubmit}>
            <div className="modal-form-row">
              <div className="form-group">
                <label>Invoice no.</label>
                <input
                  placeholder="Auto-generated if empty"
                  value={form.invoice_no}
                  onChange={(e) => setForm({ ...form, invoice_no: e.target.value })}
                  disabled={mode === 'view'}
                />
              </div>
              <div className="form-group">
                <label>Date *</label>
                <input
                  type="date"
                  value={form.invoice_date}
                  onChange={(e) => setForm({ ...form, invoice_date: e.target.value })}
                  required
                  disabled={mode === 'view'}
                />
              </div>
              <div className="form-group">
                <label>Type</label>
                <select
                  value={form.invoice_type}
                  onChange={(e) => setForm({ ...form, invoice_type: e.target.value })}
                  disabled={mode === 'view'}
                >
                  <option value="SALE">Sale</option>
                  <option value="RETURN">Return (Credit Note)</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Customer *</label>
              {mode === 'view' ? (
                <input value={selectedCustomer?.name || ''} readOnly disabled />
              ) : (
                <SearchableSelect
                  options={customers.map(c => ({ value: c.id, label: c.name }))}
                  value={form.customer_id}
                  onChange={(v) => setForm({ ...form, customer_id: v as number })}
                  placeholder="Select customer"
                />
              )}
              {selectedCustomer && (
                <p className="customer-balance">
                  Outstanding balance: <strong>{selectedCustomer.current_balance.toLocaleString('en-IN')}</strong>
                  {selectedCustomer.state && (
                    <span style={{ marginLeft: 8, fontSize: '0.8rem', color: 'var(--muted)' }}>
                      State: {selectedCustomer.state}
                    </span>
                  )}
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
                                <span className="product-name" title={item.product_name || '—'}>
                                  {item.product_name || '—'}
                                </span>
                              ) : (
                                <SearchableSelect
                                  options={products.map(p => ({ value: p.id, label: p.name }))}
                                  value={item.product_id || ''}
                                  onChange={(v) => updateItem(idx, 'product_id', v as number)}
                                  placeholder="Select product"
                                  dropdownWidth={320}
                                />
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

              {items.length === 0 && mode === 'view' && (
                <p className="no-items">No line items (legacy flat amount invoice).</p>
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
                disabled={mode === 'view'}
                placeholder="Add notes..."
              />
            </div>

            {invoice && (
              <p className="invoice-outstanding">
                Outstanding on this invoice: <strong>₹{invoice.total_remaining.toLocaleString('en-IN')}</strong>
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
              <button type="button" className="btn btn-secondary" onClick={onEdit}>
                Edit
              </button>
              <button type="button" className="btn" onClick={onClose}>
                Close
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" form="invoice-form" className="btn" disabled={saving}>
                {saving ? 'Saving…' : mode === 'create' ? 'Create Invoice' : 'Save Changes'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
