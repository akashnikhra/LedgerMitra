import { useState, useEffect } from 'react';
import LedgerFilters from './LedgerFilters';
import LedgerTable from './LedgerTable';
import LedgerSummary from './LedgerSummary';
import PrintPreviewModal from './PrintPreviewModal';

interface LedgerEntry { id: number; date: string; type: string; reference_no: string; debit: number; credit: number; balance: number; invoice_no?: string; invoice_id?: number; }
interface Customer { id: number; name: string; }
interface FinancialYear { id: number; name: string; start_date: string; end_date: string; }

interface Props { onChanged?: () => void; companyId?: number; activeFY?: FinancialYear; }

export default function LedgerPanel({ onChanged, companyId, activeFY }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [summary, setSummary] = useState<{
    openingBalance: number;
    totalDebit: number;
    totalCredit: number;
    closingBalance: number;
    invoiceCount: number;
    receiptCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [printModal, setPrintModal] = useState<{ open: boolean; template: string; id: number; ledgerData?: { customerId?: number; fyId?: number; entries?: unknown[]; summary?: unknown } }>({ open: false, template: '', id: 0 });

  useEffect(() => { loadCustomers(); loadFinancialYears(); }, []);
  useEffect(() => { if (selectedCustomer) loadLedger(); }, [selectedCustomer, selectedYear]);

  async function loadCustomers() {
    const custs = await window.electronAPI.getCustomers();
    setCustomers(custs || []);
  }

  async function loadFinancialYears() {
    if (!companyId) return;
    const fys = await window.electronAPI.getFinancialYears(companyId);
    setFinancialYears(fys || []);
  }

  function computeSummary(apiEntries: LedgerEntry[], openingBalance: number, closingBalance: number) {
    let totalDebit = 0;
    let totalCredit = 0;
    let invoiceCount = 0;
    let receiptCount = 0;
    for (const e of apiEntries) {
      totalDebit += e.debit || 0;
      totalCredit += e.credit || 0;
      if (e.type === 'INVOICE') invoiceCount++;
      else if (e.type === 'PAYMENT') receiptCount++;
    }
    return { openingBalance, totalDebit, totalCredit, closingBalance, invoiceCount, receiptCount };
  }

  function mapEntries(raw: { entry_date?: string; entry_type?: string; invoice_no?: string; receipt_no?: string; invoice_id?: number; debit?: number; credit?: number; balance?: number; id: number }[]): LedgerEntry[] {
    return raw.map(e => ({
      id: e.id,
      date: e.entry_date || '',
      type: e.entry_type || '',
      reference_no: e.invoice_no || e.receipt_no || '',
      debit: e.debit || 0,
      credit: e.credit || 0,
      balance: e.balance || 0,
      invoice_no: e.invoice_no || undefined,
      invoice_id: e.invoice_id || undefined,
    }));
  }

  async function loadLedger() {
    setLoading(true);
    try {
      const custId = parseInt(selectedCustomer);
      if (selectedYear) {
        const result = await window.electronAPI.getYearLedger(parseInt(selectedYear), custId);
        const mapped = mapEntries(result?.entries || []);
        setEntries(mapped);
        const apiSummary = result?.summary;
        if (apiSummary) {
          setSummary({
            openingBalance: apiSummary.openingBalance,
            totalDebit: apiSummary.totalDebit,
            totalCredit: apiSummary.totalCredit,
            closingBalance: apiSummary.netBalance,
            invoiceCount: mapped.filter(e => e.type === 'INVOICE').length,
            receiptCount: mapped.filter(e => e.type === 'PAYMENT').length,
          });
        } else {
          setSummary(null);
        }
      } else {
        const result = await window.electronAPI.getCustomerLedger(custId);
        const mapped = mapEntries(result?.entries || []);
        setEntries(mapped);
        setSummary(computeSummary(mapped, result?.openingBalance || 0, result?.closingBalance || 0));
      }
    } catch (e) { console.error('Failed to load ledger:', e); }
    finally { setLoading(false); }
  }

  function handlePrintLedger() {
    const custId = parseInt(selectedCustomer);
    const fyId = selectedYear ? parseInt(selectedYear) : undefined;
    setPrintModal({ open: true, template: 'ledger', id: 0, ledgerData: { customerId: custId || undefined, fyId, entries, summary } });
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Customer Ledger</h2>
        <button className="btn btn-sm" onClick={handlePrintLedger}>Print Ledger</button>
      </div>
      <LedgerFilters
        customers={customers}
        selectedCustomer={selectedCustomer}
        selectedYear={selectedYear}
        onCustomerChange={setSelectedCustomer}
        onYearChange={setSelectedYear}
        financialYears={financialYears}
      />
      {loading ? <p className="muted">Loading...</p> : (
        <>
          <LedgerSummary summary={summary} />
          <LedgerTable
            entries={entries}
            customerId={selectedCustomer ? parseInt(selectedCustomer) : undefined}
            customerName={customers.find(c => c.id === parseInt(selectedCustomer))?.name}
            companyId={companyId}
          />
        </>
      )}
      <PrintPreviewModal isOpen={printModal.open} onClose={() => setPrintModal({ ...printModal, open: false })} template={printModal.template} id={printModal.id} ledgerData={printModal.ledgerData} />
    </div>
  );
}
