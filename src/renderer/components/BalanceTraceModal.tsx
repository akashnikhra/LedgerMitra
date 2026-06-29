import { useEffect, useState, useRef } from 'react';
import type { FyCarryForwardTrace } from '@shared/types';

interface Props {
  isOpen: boolean;
  customerId: number;
  customerName: string;
  companyId: number;
  onClose: () => void;
}

export default function BalanceTraceModal({ isOpen, customerId, customerName, companyId, onClose }: Props) {
  const [trace, setTrace] = useState<FyCarryForwardTrace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);

  // Auto-focus Close button on mount
  useEffect(() => {
    if (isOpen) setTimeout(() => modalRef.current?.querySelector<HTMLButtonElement>('.btn')?.focus(), 0);
  }, [isOpen]);

  // Escape to close, focus trap
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key === 'Tab' && modalRef.current) {
        const els = modalRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])');
        if (!els.length) return;
        const first = els[0], last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    if (!isOpen || !customerId) return;
    setLoading(true);
    setError('');
    window.electronAPI.getCustomerBalanceTrace(customerId, companyId)
      .then((result: FyCarryForwardTrace) => setTrace(result))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [isOpen, customerId]);

  if (!isOpen) return null;

  const format = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2 });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" ref={modalRef} style={{ maxWidth: '800px', maxHeight: '80vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()} tabIndex={-1}>
        <div className="modal-header">
          <h3>Balance Trace: {customerName}</h3>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {loading && <p className="muted">Loading trace...</p>}
          {error && <div className="alert alert-error">{error}</div>}
          {trace && (
            <div>
              <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--surface-soft)', borderRadius: '4px' }}>
                <strong>Current Balance: </strong>
                <span style={{ color: trace.currentBalance > 0 ? 'var(--debit, #c00)' : 'var(--credit, #080)' }}>
                  ₹{format(Math.abs(trace.currentBalance))} {trace.currentBalance > 0 ? 'Dr' : trace.currentBalance < 0 ? 'Cr' : ''}
                </span>
              </div>

              {trace.chain.length === 0 && <p className="muted">No FY history found for this customer.</p>}

              {trace.chain.map((fy, idx) => (
                <div key={fy.fyId} style={{ marginBottom: '1.5rem', border: '1px solid var(--hairline)', borderRadius: '4px', padding: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <strong style={{ fontSize: '1.1rem' }}>{fy.fyName}</strong>
                    {idx > 0 && (
                      <span style={{ fontSize: '0.85rem', color: 'var(--accent)' }}>
                        ← Carry forward from previous FY
                      </span>
                    )}
                  </div>

                  {fy.entries.length === 0 ? (
                    <p className="muted" style={{ fontSize: '0.9rem' }}>No entries for this FY.</p>
                  ) : (
                    <table style={{ width: '100%', fontSize: '0.9rem' }}>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Type</th>
                          <th>Reference</th>
                          <th>Debit</th>
                          <th>Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fy.entries.map((entry, ei) => (
                          <tr key={ei}>
                            <td>{entry.entryDate}</td>
                            <td>{entry.entryType}</td>
                            <td>{entry.invoiceNo || entry.receiptNo || '-'}</td>
                            <td className={entry.debit ? 'debit' : ''}>{entry.debit ? `₹${format(entry.debit)}` : '-'}</td>
                            <td className={entry.credit ? 'credit' : ''}>{entry.credit ? `₹${format(entry.credit)}` : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {fy.isOpening && idx > 0 && (
                    <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'var(--surface-soft)', borderRadius: '4px', fontSize: '0.85rem' }}>
                      <strong>Opening Balance:</strong> ₹{format(fy.amount)} {fy.balanceType} ← from {trace.chain[idx - 1]?.fyName}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}