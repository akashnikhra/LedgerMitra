interface Props {
  summary: {
    openingBalance: number;
    totalDebit: number;
    totalCredit: number;
    closingBalance: number;
    invoiceCount: number;
    receiptCount: number;
  } | null;
}

export default function LedgerSummary({ summary }: Props) {
  if (!summary) return null;

  const format = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  const balLabel = summary.closingBalance > 0 ? 'Dr' : summary.closingBalance < 0 ? 'Cr' : '';
  const balAbs = Math.abs(summary.closingBalance);

  return (
    <div className="ledger-summary">
      <div className="summary-card">
        <span className="label">Opening Balance</span>
        <span className="value">{format(summary.openingBalance)}</span>
      </div>
      <div className="summary-card">
        <span className="label">Total Debit</span>
        <span className="value debit">{format(summary.totalDebit)}</span>
      </div>
      <div className="summary-card">
        <span className="label">Total Credit</span>
        <span className="value credit">{format(summary.totalCredit)}</span>
      </div>
      <div className="summary-card highlight">
        <span className="label">Closing Balance</span>
        <span className="value">{format(balAbs)} {balLabel}</span>
      </div>
      <div className="summary-card">
        <span className="label">Invoices</span>
        <span className="value">{summary.invoiceCount}</span>
      </div>
      <div className="summary-card">
        <span className="label">Receipts</span>
        <span className="value">{summary.receiptCount}</span>
      </div>
    </div>
  );
}
