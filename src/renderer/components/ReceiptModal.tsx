import { useState, useEffect } from 'react';
import SearchableSelect from './SearchableSelect';

interface Customer { id: number; name: string; }
interface Invoice { id: number; invoice_no: string; invoice_date: string; total_amount: number; total_remaining: number; }
interface Allocation { invoice_id: number; allocated_amount: number; }

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: unknown) => void;
  customers: Customer[];
}

export default function ReceiptModal({ isOpen, onClose, onSave, customers }: Props) {
  const [customerId, setCustomerId] = useState('');
  const [amount, setAmount] = useState('');
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [referenceNo, setReferenceNo] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [narration, setNarration] = useState('');
  const [allocMode, setAllocMode] = useState<'auto' | 'manual'>('auto');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (customerId) loadInvoices(parseInt(customerId));
    else { setInvoices([]); setAllocations([]); }
  }, [customerId]);

  async function loadInvoices(custId: number) {
    const invs = await window.electronAPI.getOutstandingInvoices(custId);
    setInvoices(invs || []);
  }

  async function handleAutoAllocate() {
    const custId = parseInt(customerId);
    const amt = parseFloat(amount) || 0;
    if (!custId || amt <= 0) return;
    const allocs = await window.electronAPI.autoAllocateReceipt(custId, amt);
    setAllocations(allocs || []);
  }

  function handleAmountChange(value: string) {
    setAmount(value);
    if (allocMode === 'auto' && customerId) handleAutoAllocate();
  }

  async function handleSubmit() {
    if (!customerId || !amount) return;
    setLoading(true);
    try {
      const data = {
        customer_id: parseInt(customerId),
        receipt_date: receiptDate,
        amount: parseFloat(amount),
        payment_method: paymentMethod,
        reference_no: referenceNo || undefined,
        bank_account: bankAccount || undefined,
        narration: narration || undefined,
        allocations: allocations.length > 0 ? allocations : []
      };
      await onSave(data);
      resetForm();
      onClose();
    } catch (e) {
      setError('Failed to create receipt');
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setCustomerId(''); setAmount(''); setReceiptDate(new Date().toISOString().split('T')[0]);
    setPaymentMethod('CASH'); setReferenceNo(''); setBankAccount(''); setNarration('');
    setAllocations([]); setInvoices([]);
  }

  if (!isOpen) return null;

  const allocatedTotal = allocations.reduce((sum, a) => sum + a.allocated_amount, 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>New Payment Receipt</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-grid">
            <div className="form-group">
              <label>Customer *</label>
              <SearchableSelect
                options={customers.map(c => ({ value: c.id, label: c.name }))}
                value={customerId}
                onChange={(v) => setCustomerId(String(v))}
                placeholder="Select customer"
              />
            </div>
            <div className="form-group">
              <label>Amount *</label>
              <input type="number" className="input" value={amount} onChange={e => handleAmountChange(e.target.value)} step="0.01" min="0" />
            </div>
            <div className="form-group">
              <label>Date</label>
              <input type="date" className="input" value={receiptDate} onChange={e => setReceiptDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Payment Method</label>
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="input">
                <option value="CASH">Cash</option><option value="UPI">UPI</option>
                <option value="CHEQUE">Cheque</option><option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div className="form-group">
              <label>Reference No.</label>
              <input type="text" className="input" value={referenceNo} onChange={e => setReferenceNo(e.target.value)} placeholder="UTR / Cheque No." />
            </div>
            <div className="form-group">
              <label>Bank Account</label>
              <input type="text" className="input" value={bankAccount} onChange={e => setBankAccount(e.target.value)} placeholder="Bank account name" />
            </div>
          </div>
          <div className="form-group">
            <label>Narration</label>
            <textarea className="input" value={narration} onChange={e => setNarration(e.target.value)} rows={2} placeholder="Optional notes..." />
          </div>
          {invoices.length > 0 && (
            <div className="allocation-section">
              <div className="allocation-header">
                <h4>Invoice Allocation</h4>
                <div className="alloc-controls">
                  <label><input type="radio" name="allocMode" value="auto" checked={allocMode === 'auto'} onChange={() => setAllocMode('auto')} /> Auto</label>
                  <label><input type="radio" name="allocMode" value="manual" checked={allocMode === 'manual'} onChange={() => setAllocMode('manual')} /> Manual</label>
                  {allocMode === 'auto' && <button className="btn btn-sm" onClick={handleAutoAllocate}>Re-allocate</button>}
                </div>
              </div>
              <table className="alloc-table">
                <thead><tr><th>Invoice</th><th>Date</th><th>Remaining</th><th>Allocated</th></tr></thead>
                <tbody>
                  {invoices.map(inv => {
                    const alloc = allocations.find(a => a.invoice_id === inv.id);
                    return (
                      <tr key={inv.id}>
                        <td>{inv.invoice_no}</td><td>{inv.invoice_date}</td>
                        <td>₹{inv.total_remaining.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        {allocMode === 'manual' ? (
                          <td><input type="number" className="input-sm" value={alloc?.allocated_amount || ''} onChange={e => {
                            const num = parseFloat(e.target.value) || 0;
                            const updated = allocations.map(a => a.invoice_id === inv.id ? { ...a, allocated_amount: Math.min(num, inv.total_remaining) } : a);
                            if (!alloc) updated.push({ invoice_id: inv.id, allocated_amount: Math.min(num, inv.total_remaining) });
                            setAllocations(updated);
                          }} max={inv.total_remaining} min={0} step="0.01" /></td>
                        ) : (
                          <td>{alloc ? `₹${alloc.allocated_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}</td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="alloc-footer">
                <span>Total Allocated: ₹{allocatedTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                {allocatedTotal > parseFloat(amount || '0') && <span className="text-error">Exceeds payment amount!</span>}
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={loading || !customerId || !amount}>
            {loading ? 'Saving...' : 'Save Receipt'}
          </button>
        </div>
      </div>
    </div>
  );
}
