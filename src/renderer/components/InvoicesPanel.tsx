import { useEffect, useState } from 'react';
import type { Customer, Invoice, Product } from '@shared/types';
import InvoiceModal from './InvoiceModal';
import PrintPreviewModal from './PrintPreviewModal';

interface Props {
  onChanged?: () => void;
  initialInvoiceId?: number | null;
  onClearInvoiceId?: () => void;
}

export default function InvoicesPanel({ onChanged, initialInvoiceId, onClearInvoiceId }: Props) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mode, setMode] = useState<'create' | 'edit' | 'view' | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [printModal, setPrintModal] = useState<{ open: boolean; template: string; id: number }>({ open: false, template: '', id: 0 });

  async function load() {
    const [inv, cust, prods] = await Promise.all([
      window.electronAPI.getInvoices({ type: typeFilter === 'ALL' ? undefined : typeFilter }),
      window.electronAPI.getCustomers(),
      window.electronAPI.getProducts()
    ]);
    setInvoices(inv);
    setCustomers(cust);
    setProducts(prods);
  }

  useEffect(() => {
    load();
  }, [typeFilter]);

  useEffect(() => {
    if (initialInvoiceId && invoices.length > 0) {
      const inv = invoices.find(i => i.id === initialInvoiceId);
      if (inv) {
        openView(inv);
        onClearInvoiceId?.();
      }
    }
  }, [initialInvoiceId, invoices]);

  const filtered = invoices.filter((inv) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      inv.invoice_no.toLowerCase().includes(q) ||
      (inv.customer_name || '').toLowerCase().includes(q)
    );
  });

  async function openCreate() {
    if (customers.length === 0) {
      setError('Add at least one customer before creating an invoice.');
      return;
    }
    setSelectedId(null);
    setMode('create');
    setError('');
  }

  async function openView(invoice: Invoice) {
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
    customer_id: number;
    invoice_type?: string;
    notes?: string;
    items: Array<{ product_id?: number; product_name?: string; qty: number; rate: number; gst_rate: number; discount_pct?: number; remarks?: string }>;
  }) {
    try {
      const res =
        mode === 'create'
          ? await window.electronAPI.createInvoice(data)
          : await window.electronAPI.updateInvoice(selectedId!, data);

      if (!res.success) {
        return { success: false, error: res.error || 'Could not save invoice' };
      }

      await load();
      onChanged?.();
      const invoiceId = res.data?.id;
      return { success: true, id: invoiceId };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  async function handleDelete(id: number) {
    try {
      const res = await window.electronAPI.deleteInvoice(id);
      if (!res.success) {
        return { success: false, error: res.error || 'Could not delete invoice' };
      }
      await load();
      onChanged?.();
      return { success: true };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  const selectedInvoice = invoices.find((i) => i.id === selectedId);

  async function handlePrintInvoice(id: number) {
    setPrintModal({ open: true, template: 'invoice', id });
  }

  return (
    <div className="invoices-panel">
      <div className="invoices-toolbar">
        <h2>Sales Invoices ({invoices.length})</h2>
        <button type="button" className="btn" onClick={openCreate}>
          + New invoice
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {customers.length === 0 && (
        <div className="alert alert-warn">
          Create customers first, then add invoices for the active financial year.
        </div>
      )}

      <div className="toolbar-row">
        <div className="form-group search-group">
          <input
            placeholder="Search by invoice no. or customer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="form-group" style={{ minWidth: 140 }}>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="ALL">All types</option>
            <option value="SALE">Sales only</option>
            <option value="RETURN">Returns only</option>
          </select>
        </div>
      </div>

      <div className="card invoices-table-card">
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>No</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>Due</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-state">
                  No invoices yet. Click <strong>New invoice</strong> to add one.
                </td>
              </tr>
            ) : (
              filtered.map((inv) => (
                <tr
                  key={inv.id}
                  className={selectedId === inv.id && mode !== null ? 'selected' : ''}
                  onClick={() => openView(inv)}
                >
                  <td>
                    <span className={`badge ${inv.invoice_type === 'RETURN' ? 'badge-return' : 'badge-sale'}`}>
                      {inv.invoice_type === 'RETURN' ? 'Return' : 'Sale'}
                    </span>
                  </td>
                  <td>{inv.invoice_no}</td>
                  <td>{inv.invoice_date}</td>
                  <td>{inv.customer_name || '—'}</td>
                  <td>₹{inv.total_amount.toLocaleString('en-IN')}</td>
                  <td>₹{inv.total_remaining.toLocaleString('en-IN')}</td>
                  <td><button className="btn-print" onClick={(e) => { e.stopPropagation(); handlePrintInvoice(inv.id); }}>Print</button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {mode && selectedInvoice && (
        <InvoiceModal
          mode={mode}
          invoice={selectedInvoice}
          customers={customers}
          products={products}
          onClose={closeModal}
          onSave={handleSave}
          onDelete={handleDelete}
          onEdit={() => setMode('edit')}
          onPrint={(id) => setPrintModal({ open: true, template: 'invoice', id })}
          onWhatsApp={(id) => setPrintModal({ open: true, template: 'invoice', id })}
        />
      )}

      {mode === 'create' && (
        <InvoiceModal
          mode="create"
          invoice={null}
          customers={customers}
          products={products}
          onClose={closeModal}
          onSave={handleSave}
          onDelete={handleDelete}
          onPrint={(id) => setPrintModal({ open: true, template: 'invoice', id })}
          onWhatsApp={(id) => setPrintModal({ open: true, template: 'invoice', id })}
        />
      )}

      <PrintPreviewModal isOpen={printModal.open} onClose={() => setPrintModal({ ...printModal, open: false })} template={printModal.template} id={printModal.id} />
    </div>
  );
}
