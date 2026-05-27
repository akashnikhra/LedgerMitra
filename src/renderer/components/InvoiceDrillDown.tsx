interface LedgerEntry { id: number; date: string; type: string; reference_no: string; debit: number; credit: number; balance: number; }

interface Props {
  entries: LedgerEntry[];
  onBack: () => void;
}

export default function InvoiceDrillDown({ entries, onBack }: Props) {
  const format = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2 });

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Invoice Ledger Entries</h2>
        <button className="btn btn-sm" onClick={onBack}>← Back to ledger</button>
      </div>
      {entries.length === 0 ? (
        <p className="muted">No entries found.</p>
      ) : (
        <table className="ledger-table">
          <thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead>
          <tbody>
            {entries.map(entry => (
              <tr key={entry.id}>
                <td>{entry.date}</td>
                <td>{entry.type}</td>
                <td>{entry.reference_no || '-'}</td>
                <td className={entry.debit > 0 ? 'debit' : ''}>{entry.debit > 0 ? `₹${format(entry.debit)}` : '-'}</td>
                <td className={entry.credit > 0 ? 'credit' : ''}>{entry.credit > 0 ? `₹${format(entry.credit)}` : '-'}</td>
                <td className={entry.balance < 0 ? 'credit' : entry.balance > 0 ? 'debit' : ''}>
                  {format(Math.abs(entry.balance))} {entry.balance > 0 ? 'Dr' : entry.balance < 0 ? 'Cr' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
