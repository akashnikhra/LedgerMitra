import { useState, useEffect } from 'react';
import ReceiptModal from './ReceiptModal';
import PrintPreviewModal from './PrintPreviewModal';

interface Receipt { id: number; receipt_no: string; receipt_date: string; amount: number; payment_method: string; reference_no?: string; customer_name?: string; }
interface Customer { id: number; name: string; }

interface Props { onChanged?: () => void; }

export default function ReceiptsPanel({ onChanged }: Props) {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterMethod, setFilterMethod] = useState('');
  const [loading, setLoading] = useState(false);
  const [printModal, setPrintModal] = useState<{ open: boolean; template: string; id: number }>({ open: false, template: '', id: 0 });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [recs, custs] = await Promise.all([window.electronAPI.getReceipts({}), window.electronAPI.getCustomers()]);
      setReceipts(recs || []);
      setCustomers(custs || []);
    } catch (e) { console.error('Failed to load receipts:', e); }
    finally { setLoading(false); }
  }

  async function handleSave(data: unknown) {
    await window.electronAPI.createReceipt(data);
    await loadData();
    onChanged?.();
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this receipt? This will restore invoice balances.')) return;
    await window.electronAPI.deleteReceipt(id);
    await loadData();
    onChanged?.();
  }

  async function handlePrintReceipt(id: number) {
    setPrintModal({ open: true, template: 'receipt', id });
  }

  const filtered = receipts.filter(r => {
    if (filterCustomer && r.customer_name?.toLowerCase().indexOf(filterCustomer.toLowerCase()) === -1) return false;
    if (filterMethod && r.payment_method !== filterMethod) return false;
    return true;
  });

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Payment Receipts</h2>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)}>+ New Receipt</button>
      </div>
      <div className="panel-filters">
        <input type="text" className="input" placeholder="Filter by customer..." value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)} />
        <select className="input" value={filterMethod} onChange={e => setFilterMethod(e.target.value)}>
          <option value="">All methods</option><option value="CASH">Cash</option><option value="UPI">UPI</option>
          <option value="CHEQUE">Cheque</option><option value="BANK_TRANSFER">Bank Transfer</option><option value="OTHER">Other</option>
        </select>
      </div>
      {loading ? <p className="muted">Loading...</p> : filtered.length === 0 ? (
        <p className="muted">No receipts found.</p>
      ) : (
        <table>
          <thead><tr><th>Receipt No</th><th>Date</th><th>Customer</th><th>Amount</th><th>Method</th><th>Reference</th><th>Actions</th></tr></thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id}>
                <td>{r.receipt_no}</td><td>{r.receipt_date}</td><td>{r.customer_name}</td>
                <td>₹{r.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td><td>{r.payment_method}</td>
                <td>{r.reference_no || '-'}</td>
                <td><button className="btn-print" onClick={() => handlePrintReceipt(r.id)}>Print</button> <button className="btn btn-sm" onClick={() => handleDelete(r.id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ReceiptModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSave={handleSave} customers={customers} />
      <PrintPreviewModal isOpen={printModal.open} onClose={() => setPrintModal({ ...printModal, open: false })} template={printModal.template} id={printModal.id} />
    </div>
  );
}
