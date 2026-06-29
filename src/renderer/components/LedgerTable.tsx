import { useState } from 'react';
import BalanceTraceModal from './BalanceTraceModal';

interface LedgerEntry {
  id: number;
  date: string;
  type: string;
  reference_no: string;
  debit: number;
  credit: number;
  balance: number;
  invoice_no?: string;
  invoice_id?: number;
  fy_source_id?: number;
  customer_name?: string;
  customer_id?: number;
}

interface Props {
  entries: LedgerEntry[];
  customerId?: number;
  customerName?: string;
  companyId?: number;
  showCustomerColumn?: boolean;
}

export default function LedgerTable({ entries, customerId, customerName, companyId, showCustomerColumn }: Props) {
  const [traceModal, setTraceModal] = useState<{ open: boolean; customerId: number; customerName: string }>({
    open: false, customerId: 0, customerName: ''
  });

  const format = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2 });

  function renderType(entry: LedgerEntry) {
    return entry.type;
  }

  const colSpan = (showCustomerColumn ? 1 : 0) + (customerId ? 1 : 0) + 6;

  return (
    <>
      <table className="ledger-table">
        <thead>
          <tr>
            <th>Date</th>
            {showCustomerColumn && <th>Customer</th>}
            <th>Type</th><th>Reference</th><th>Debit</th><th>Credit</th><th>Balance</th>
            {customerId && <th></th>}
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr><td colSpan={colSpan} className="muted">No entries found.</td></tr>
          ) : entries.map(entry => (
            <tr key={entry.id}>
              <td>{entry.date}</td>
              {showCustomerColumn && <td>{entry.customer_name || '-'}</td>}
              <td>{renderType(entry)}</td>
              <td>{entry.reference_no || '-'}</td>
              <td className={entry.debit > 0 ? 'debit' : ''}>{entry.debit > 0 ? `₹${format(entry.debit)}` : '-'}</td>
              <td className={entry.credit > 0 ? 'credit' : ''}>{entry.credit > 0 ? `₹${format(entry.credit)}` : '-'}</td>
              <td className={entry.balance < 0 ? 'credit' : entry.balance > 0 ? 'debit' : ''}>
                {format(Math.abs(entry.balance))} {entry.balance > 0 ? 'Dr' : entry.balance < 0 ? 'Cr' : ''}
              </td>
              {customerId && (
                <td>
                  <button
                    className="btn-icon"
                    style={{ fontSize: '0.75rem', padding: '2px 6px' }}
                    onClick={() => setTraceModal({ open: true, customerId, customerName: customerName || '' })}
                    title="Trace balance across FYs"
                  >
                    Trace
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <BalanceTraceModal
        isOpen={traceModal.open}
        customerId={traceModal.customerId}
        customerName={traceModal.customerName}
        companyId={companyId ?? 0}
        onClose={() => setTraceModal({ ...traceModal, open: false })}
      />
    </>
  );
}
