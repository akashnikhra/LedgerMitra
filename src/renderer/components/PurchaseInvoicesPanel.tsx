import { useEffect, useState } from 'react';
import type { Supplier, PurchaseInvoice, Product } from '@shared/types';
import PurchaseInvoiceModal from './PurchaseInvoiceModal';

interface Props {
  onChanged?: () => void;
}

export default function PurchaseInvoicesPanel({ onChanged }: Props) {
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mode, setMode] = useState<'create' | 'view' | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  async function load() {
    const [inv, sups, prods] = await Promise.all([
      window.electronAPI.getPurchaseInvoices(),
      window.electronAPI.getSuppliers(),
      window.electronAPI.getProducts()
    ]);
    setInvoices(inv);
    setSuppliers(sups);
    setProducts(prods);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = invoices.filter((inv) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      inv.invoice_no.toLowerCase().includes(q) ||
      (inv.supplier_name || '').toLowerCase().includes(q)
    );
  });

  async function openCreate() {
    if (suppliers.length === 0) {
      setError('Add at least one supplier before creating a purchase invoice.');
      return;
    }
    setSelectedId(null);
    setMode('create');
    setError('');
  }

  async function openView(invoice: PurchaseInvoice) {
    setSelectedId(invoice.id);
    setMode('view');
    setError('');
  }

  function closeModal() {
    setMode(null);
    setSelectedId(null);
    setError('');
  }

  async function handleSave(data: {
    invoice_no?: string;
    invoice_date: string;
    supplier_id: number;
    notes?: string;
    items: Array<{ product_id?: number; product_name?: string; qty: number; rate: number; gst_rate: number }>;
  }) {
    try {
      const res = await window.electronAPI.createPurchaseInvoice(data);
      if (!res.success) {
        return { success: false, error: res.error || 'Could not save purchase invoice' };
      }
      await load();
      onChanged?.();
      return { success: true };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  async function handleDelete(id: number) {
    try {
      const res = await window.electronAPI.deletePurchaseInvoice(id);
      if (!res.success) {
        return { success: false, error: res.error || 'Could not delete purchase invoice' };
      }
      await load();
      onChanged?.();
      return { success: true };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  const selectedInvoice = invoices.find((i) => i.id === selectedId);

  return (
    <div className="invoices-panel">
      <div className="invoices-toolbar">
        <h2>Purchase Invoices ({invoices.length})</h2>
        <button type="button" className="btn" onClick={openCreate}>
          + New purchase
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {suppliers.length === 0 && (
        <div className="alert alert-warn">
          Add suppliers first, then create purchase invoices.
        </div>
      )}

      <div className="form-group search-group">
        <input
          placeholder="Search by invoice no. or supplier…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card invoices-table-card">
        <table>
          <thead>
            <tr>
              <th>No</th>
              <th>Date</th>
              <th>Supplier</th>
              <th>Amount</th>
              <th>Due</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty-state">
                  No purchase invoices yet. Click <strong>New purchase</strong> to add one.
                </td>
              </tr>
            ) : (
              filtered.map((inv) => (
                <tr
                  key={inv.id}
                  className={selectedId === inv.id && mode !== null ? 'selected' : ''}
                  onClick={() => openView(inv)}
                >
                  <td>{inv.invoice_no}</td>
                  <td>{inv.invoice_date}</td>
                  <td>{inv.supplier_name || '—'}</td>
                  <td>₹{inv.total_amount.toLocaleString('en-IN')}</td>
                  <td>₹{inv.total_remaining.toLocaleString('en-IN')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {mode && selectedInvoice && (
        <PurchaseInvoiceModal
          mode={mode}
          invoice={selectedInvoice}
          suppliers={suppliers}
          products={products}
          onClose={closeModal}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}

      {mode === 'create' && (
        <PurchaseInvoiceModal
          mode="create"
          invoice={null}
          suppliers={suppliers}
          products={products}
          onClose={closeModal}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
