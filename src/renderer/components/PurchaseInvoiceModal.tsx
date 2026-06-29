import { useEffect, useState, useRef, useCallback } from 'react';
import type { Supplier, PurchaseInvoice, Product } from '@shared/types';
import SearchableSelect from './SearchableSelect';

type FormMode = 'create' | 'view';

interface ItemRow {
  product_id?: number;
  product_name?: string;
  qty: number;
  rate: number;
  gst_rate: number;
  discount_pct: number;
  remarks: string;
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
    items: Array<{ product_id?: number; product_name?: string; qty: number; rate: number; gst_rate: number; discount_pct?: number; remarks?: string }>;
  }) => Promise<{ success: boolean; error?: string }>;
  onDelete: (id: number) => Promise<{ success: boolean; error?: string }>;
}

const emptyItem = { product_id: undefined, product_name: '', qty: 1, rate: 0, gst_rate: 0, discount_pct: 0, remarks: '' };

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
  const qtyRefs = useRef<Map<number, HTMLInputElement | null>>(new Map());
  const modalRef = useRef<HTMLDivElement>(null);
  const supplierRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode === 'create') {
      setForm({
        ...emptyForm,
        invoice_date: new Date().toISOString().slice(0, 10),
        supplier_id: suppliers.length > 0 ? String(suppliers[0].id) : ''
      });
      setItems([{ ...emptyItem }]);
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
            gst_rate: item.gst_rate || 0,
            discount_pct: item.discount_pct || 0,
            remarks: item.remarks || ''
          }))
        );
      });
    }
  }, [mode, invoice, suppliers]);

  // Auto-focus first field on mount
  useEffect(() => {
    if (mode === 'create') {
      setTimeout(() => supplierRef.current?.focus(), 0);
    } else if (mode === 'view') {
      setTimeout(() => {
        modalRef.current?.querySelector<HTMLButtonElement>('.btn')?.focus();
      }, 0);
    }
  }, [mode]);

  // Global keyboard: Escape to close, Ctrl+S to save, focus trap
  useEffect(() => {
    function handleGlobalKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        document.getElementById('purchase-invoice-form')?.requestSubmit();
        return;
      }
      // Focus trap
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'input:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', handleGlobalKey);
    return () => document.removeEventListener('keydown', handleGlobalKey);
  }, [onClose]);

  function addItem() {
    setItems([...items, { ...emptyItem }]);
  }

  function removeItem(index: number) {
    const updated = items.filter((_, i) => i !== index);
    if (mode !== 'view' && updated.length === 0) {
      updated.push({ ...emptyItem });
    }
    setItems(updated);
  }

  const updateItem = useCallback((index: number, field: keyof ItemRow, value: number | undefined | string) => {
    setItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };

      if (field === 'product_id' && typeof value === 'number') {
        const product = products.find((p) => p.id === value);
        if (product) {
          updated[index].product_name = product.name;
          updated[index].rate = product.purchase_rate || 0;
          updated[index].gst_rate = product.gst_rate || 0;
        }
        // Auto-add empty row if product selected in last row
        if (index === updated.length - 1) {
          updated.push({ ...emptyItem });
        }
      }

      return updated;
    });
  }, [products]);

  function handleItemKeyDown(e: React.KeyboardEvent, rowIdx: number, field: 'qty' | 'rate' | 'gst' | 'discount') {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (field === 'qty') {
        const rateInput = (e.target as HTMLElement).closest('tr')?.querySelector('.col-rate input') as HTMLInputElement;
        rateInput?.focus();
        rateInput?.select();
      } else if (field === 'rate') {
        const gstInput = (e.target as HTMLElement).closest('tr')?.querySelector('.col-gst input') as HTMLInputElement;
        gstInput?.focus();
        gstInput?.select();
      } else if (field === 'gst') {
        const discountInput = (e.target as HTMLElement).closest('tr')?.querySelector('.col-discount input') as HTMLInputElement;
        discountInput?.focus();
        discountInput?.select();
      } else if (field === 'discount') {
        if (rowIdx === items.length - 1) {
          setItems(prev => [...prev, { ...emptyItem }]);
          setTimeout(() => {
            const nextQty = qtyRefs.current.get(rowIdx + 1);
            nextQty?.focus();
            nextQty?.select();
          }, 0);
        } else {
          const nextQty = qtyRefs.current.get(rowIdx + 1);
          nextQty?.focus();
          nextQty?.select();
        }
      }
    }
  }

  function calcTotals() {
    let subtotal = 0;
    let taxAmount = 0;
    let totalDiscount = 0;
    for (const item of items) {
      if (!item.product_id && item.qty <= 0 && item.rate <= 0) continue;
      const lineAmt = item.qty * item.rate;
      const discountAmt = item.discount_pct ? (lineAmt * item.discount_pct) / 100 : 0;
      const amt = lineAmt - discountAmt;
      subtotal += amt;
      totalDiscount += discountAmt;
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
    return { subtotal, taxAmount, cgst, sgst, igst, total: subtotal + taxAmount, totalDiscount };
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

    const filledItems = items.filter(item => item.product_id || item.qty > 0 || item.rate > 0);

    if (filledItems.length === 0) {
      setError('Add at least one item');
      return;
    }

    const { total } = calcTotals();
    if (total <= 0) {
      setError('Enter valid item quantities and rates');
      return;
    }

    const payload = {
      invoice_no: form.invoice_no.trim() || undefined,
      invoice_date: form.invoice_date,
      supplier_id: supplierId,
      notes: form.notes.trim() || undefined,
      items: filledItems.map((item) => ({
        product_id: item.product_id,
        product_name: item.product_name,
        qty: item.qty,
        rate: item.rate,
        gst_rate: item.gst_rate,
        discount_pct: item.discount_pct || 0,
        remarks: item.remarks || ''
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

  const { subtotal, taxAmount, cgst, sgst, igst, total, totalDiscount } = calcTotals();
  const selectedSupplier = suppliers.find((s) => s.id === parseInt(form.supplier_id, 10));

  return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content modal-wide" ref={modalRef} onClick={(e) => e.stopPropagation()} tabIndex={-1}>
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

          <form id="purchase-invoice-form" onSubmit={handleSubmit}>
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

            <div className="form-group" ref={supplierRef} tabIndex={-1}>
              <label>Supplier *</label>
              {mode === 'view' ? (
                <input value={selectedSupplier?.name || ''} readOnly disabled />
              ) : (
                <SearchableSelect
                  options={suppliers.map(s => ({ value: s.id, label: s.name }))}
                  value={form.supplier_id}
                  onChange={(v) => setForm({ ...form, supplier_id: v as number })}
                  placeholder="Select supplier"
                />
              )}
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
                        {mode !== 'view' && <th className="col-row-num">#</th>}
                        <th className="col-product">Product</th>
                        <th className="col-qty">Qty</th>
                        <th className="col-rate">Rate</th>
                        <th className="col-gst">GST%</th>
                        <th className="col-discount">D%</th>
                        <th className="col-amount">Amount</th>
                        {mode !== 'view' && <th className="col-remarks">Remarks</th>}
                        {mode !== 'view' && <th className="col-action"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {(mode === 'view' ? items.filter(item => item.product_id || (item.qty > 0 && item.rate > 0)) : items).map((item, idx) => {
                        const lineAmt = item.qty * item.rate;
                        const discountAmt = item.discount_pct ? (lineAmt * item.discount_pct) / 100 : 0;
                        const amt = lineAmt - discountAmt;
                        const hasProduct = !!item.product_id;
                        return (
                          <tr key={idx} className={hasProduct ? '' : 'row-empty'}>
                            {mode !== 'view' && <td className="col-row-num">{idx + 1}</td>}
                            <td className="col-product">
                              {mode === 'view' ? (
                                <span className="product-name">{item.product_name || '—'}</span>
                              ) : (
                                <SearchableSelect
                                  options={products.map(p => ({ value: p.id, label: p.name }))}
                                  value={item.product_id || ''}
                                  onChange={(v) => updateItem(idx, 'product_id', v as number)}
                                  placeholder="Select product"
                                  dropdownWidth={320}
                                  onSelect={() => {
                                    const qtyInput = qtyRefs.current.get(idx);
                                    if (qtyInput) { qtyInput.focus(); qtyInput.select(); }
                                  }}
                                />
                              )}
                            </td>
                            <td className="col-qty">
                              {mode === 'view' ? (
                                <span className="text-right">{item.qty}</span>
                              ) : (
                                <input
                                  ref={(el) => { if (el) qtyRefs.current.set(idx, el); }}
                                  type="number"
                                  min="1"
                                  value={item.qty}
                                  onChange={(e) => updateItem(idx, 'qty', parseInt(e.target.value, 10) || 0)}
                                  onKeyDown={(e) => handleItemKeyDown(e, idx, 'qty')}
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
                                  onKeyDown={(e) => handleItemKeyDown(e, idx, 'rate')}
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
                                  onKeyDown={(e) => handleItemKeyDown(e, idx, 'gst')}
                                />
                              )}
                            </td>
                            <td className="col-discount">
                              {mode === 'view' ? (
                                <span className="text-right">{item.discount_pct > 0 ? `${item.discount_pct}%` : '—'}</span>
                              ) : (
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  max="100"
                                  value={item.discount_pct || ''}
                                  placeholder="0"
                                  onChange={(e) => updateItem(idx, 'discount_pct', parseFloat(e.target.value) || 0)}
                                  onKeyDown={(e) => handleItemKeyDown(e, idx, 'discount')}
                                />
                              )}
                            </td>
                            <td className="col-amount text-right">₹{amt.toFixed(2)}</td>
                            {mode !== 'view' && (
                              <td className="col-remarks">
                                <input
                                  type="text"
                                  value={item.remarks || ''}
                                  placeholder="—"
                                  onChange={(e) => updateItem(idx, 'remarks', e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      if (idx === items.length - 1) {
                                        setItems(prev => [...prev, { ...emptyItem }]);
                                        setTimeout(() => {
                                          const nextQty = qtyRefs.current.get(idx + 1);
                                          nextQty?.focus();
                                          nextQty?.select();
                                        }, 0);
                                      } else {
                                        const nextQty = qtyRefs.current.get(idx + 1);
                                        nextQty?.focus();
                                        nextQty?.select();
                                      }
                                    }
                                  }}
                                />
                              </td>
                            )}
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
                  {totalDiscount > 0 && (
                    <div className="total-row">
                      <span>Discount:</span>
                      <span>-₹{totalDiscount.toFixed(2)}</span>
                    </div>
                  )}
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
              <button type="submit" form="purchase-invoice-form" className="btn" disabled={saving}>
                {saving ? 'Saving…' : 'Create Purchase Invoice'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
