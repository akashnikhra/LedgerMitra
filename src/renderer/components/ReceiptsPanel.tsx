import { useState, useEffect } from 'react';
import ReceiptModal from './ReceiptModal';
import PrintPreviewModal from './PrintPreviewModal';

interface Receipt { id: number; receipt_no: string; receipt_date: string; amount: number; payment_method: string; reference_no?: string; customer_name?: string; customer_id?: number; bank_account?: string; narration?: string; is_legacy?: number; fy_id?: number; }
interface Customer { id: number; name: string; }
interface FinancialYear { id: number; name: string; }

interface Props { onChanged?: () => void; }

export default function ReceiptsPanel({ onChanged }: Props) {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editReceipt, setEditReceipt] = useState<null | { id: number; customer_id: number; receipt_date: string; amount: number; payment_method: string; reference_no?: string; bank_account?: string; narration?: string; allocations: { invoice_id: number; allocated_amount: number }[] }>(null);
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterMethod, setFilterMethod] = useState('');
  const [filterFy, setFilterFy] = useState('');
  const [loading, setLoading] = useState(false);
  const [printModal, setPrintModal] = useState<{ open: boolean; template: string; id: number | string }>({ open: false, template: '', id: 0 });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [recs, custs] = await Promise.all([window.electronAPI.getReceipts({}), window.electronAPI.getCustomers()]);
      setReceipts(recs || []);
      setCustomers(custs || []);
      const companies = await window.electronAPI.getCompanies();
      if (companies && companies.length > 0) {
        const fys = await window.electronAPI.getFinancialYears(companies[0].id);
        setFinancialYears(fys || []);
      }
    } catch (e) { console.error('Failed to load receipts:', e); }
    finally { setLoading(false); }
  }

  async function handleSave(data: unknown) {
    if (editReceipt) {
      await window.electronAPI.updateReceipt(editReceipt.id, data);
    } else {
      await window.electronAPI.createReceipt(data);
    }
    await loadData();
    onChanged?.();
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this receipt? This will restore invoice balances.')) return;
    await window.electronAPI.deleteReceipt(id);
    await loadData();
    onChanged?.();
  }

  async function handleEdit(id: number) {
    const result = await window.electronAPI.getReceipt(id);
    if (!result) return;
    setEditReceipt({
      id: result.receipt.id,
      customer_id: result.receipt.customer_id,
      receipt_date: result.receipt.receipt_date,
      amount: result.receipt.amount,
      payment_method: result.receipt.payment_method,
      reference_no: result.receipt.reference_no,
      bank_account: (result.receipt as any).bank_account,
      narration: result.receipt.narration,
      allocations: result.allocations.map(a => ({ invoice_id: a.invoice_id, allocated_amount: a.allocated_amount }))
    });
    setModalOpen(true);
  }

  function handleNewReceipt() {
    setEditReceipt(null);
    setModalOpen(true);
  }

  function handlePrintReceipt(id: number | string) {
    setPrintModal({ open: true, template: 'receipt', id });
  }

  const filtered = receipts.filter(r => {
    if (filterCustomer && r.customer_name?.toLowerCase().indexOf(filterCustomer.toLowerCase()) === -1) return false;
    if (filterMethod && r.payment_method !== filterMethod) return false;
    if (filterFy && String(r.fy_id) !== filterFy) return false;
    return true;
  });

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Payment Receipts</h2>
        <button className="btn btn-primary" onClick={handleNewReceipt}>+ New Receipt</button>
      </div>
      <div className="panel-filters">
        <input type="text" className="input" placeholder="Filter by customer..." value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)} />
        <select className="input" value={filterMethod} onChange={e => setFilterMethod(e.target.value)}>
          <option value="">All methods</option><option value="CASH">Cash</option><option value="UPI">UPI</option>
          <option value="CHEQUE">Cheque</option><option value="BANK_TRANSFER">Bank Transfer</option>
          <option value="OTHER">Other</option>
        </select>
        <select className="input" value={filterFy} onChange={e => setFilterFy(e.target.value)}>
          <option value="">All years</option>
          {financialYears.map(fy => <option key={fy.id} value={fy.id}>{fy.name}</option>)}
        </select>
      </div>
      {loading ? <p className="muted">Loading...</p> : filtered.length === 0 ? (
        <p className="muted">No receipts found.</p>
      ) : (
        <table>
          <thead><tr><th>Receipt No</th><th>Date</th><th>Customer</th><th>Amount</th><th>Method</th><th>Reference</th><th>Actions</th></tr></thead>
          <tbody>
            {filtered.map(r => (
              <tr key={`${r.is_legacy ? 'l' : 'r'}-${r.id}`}>
                <td>{r.receipt_no}{r.is_legacy ? <span className="status-badge" style={{ marginLeft: 6, fontSize: '9px', background: '#f59e0b', color: '#fff' }}>LEGACY</span> : null}</td>
                <td>{r.receipt_date}</td><td>{r.customer_name}</td>
                <td>₹{r.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td><td>{r.payment_method}</td>
                <td>{r.reference_no || '-'}</td>
                <td>
                  <button className="btn-print" onClick={() => handlePrintReceipt(r.is_legacy ? r.receipt_no : r.id)}>Print</button>
                  {!r.is_legacy && (
                    <>
                      {' '}
                      <button className="btn btn-sm" onClick={() => handleEdit(r.id)}>Edit</button>{' '}
                      <button className="btn btn-sm" onClick={() => handleDelete(r.id)}>Delete</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ReceiptModal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditReceipt(null); }} onSave={handleSave} customers={customers} editReceipt={editReceipt} />
      <PrintPreviewModal isOpen={printModal.open} onClose={() => setPrintModal({ ...printModal, open: false })} template={printModal.template} id={printModal.id} />
    </div>
  );
}
