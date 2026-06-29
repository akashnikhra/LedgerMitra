import { queryAll, queryOne, executeWrite, getDatabase } from './database';
import { getActiveCompanyId } from './session';
import type { Invoice, InvoiceItem, LedgerEntry, LedgerEntryWithBalance, LedgerCustomerResult, LedgerYearResult } from '@shared/types';

export function getLedgerEntries(customerId?: number): LedgerEntry[] {
  const companyId = getActiveCompanyId();
  if (!companyId) return [];
  if (customerId) {
    return queryAll<LedgerEntry>(
      `SELECT le.*, c.name as customer_name FROM ledger_entries le
       LEFT JOIN customers c ON c.id = le.customer_id
       WHERE le.company_id = ? AND le.customer_id = ?
       ORDER BY le.entry_date DESC, le.id DESC`,
      [companyId, customerId]
    );
  }
  return queryAll<LedgerEntry>(
    `SELECT le.*, c.name as customer_name FROM ledger_entries le
     LEFT JOIN customers c ON c.id = le.customer_id
     WHERE le.company_id = ?
     ORDER BY le.entry_date DESC, le.id DESC`,
    [companyId]
  );
}

export async function addPaymentEntry(
  customerId: number,
  amount: number,
  entryDate: string,
  narration?: string,
  invoiceId?: number
): Promise<void> {
  const companyId = getActiveCompanyId()!;
  const db = getDatabase();

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO ledger_entries (entry_date, customer_id, invoice_id, entry_type, credit, company_id, narration)
       VALUES (?, ?, ?, 'PAYMENT', ?, ?, ?)`
    ).run(entryDate, customerId, invoiceId || null, amount, companyId, narration || 'Payment received');

    db.prepare(`UPDATE customers SET current_balance = current_balance - ? WHERE id = ?`).run(
      amount,
      customerId
    );

    if (invoiceId) {
      db.prepare(
        `UPDATE invoices SET total_remaining = MAX(0, total_remaining - ?) WHERE id = ? AND customer_id = ?`
      ).run(amount, invoiceId, customerId);
    }
  });

  tx();
}

export async function addPurchasePaymentEntry(
  supplierId: number,
  amount: number,
  entryDate: string,
  narration?: string,
  invoiceId?: number
): Promise<void> {
  const companyId = getActiveCompanyId()!;
  const db = getDatabase();

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO ledger_entries (entry_date, customer_id, invoice_id, entry_type, debit, company_id, narration)
       VALUES (?, ?, ?, 'PURCHASE_PAYMENT', ?, ?, ?)`
    ).run(entryDate, supplierId, invoiceId || null, amount, companyId, narration || 'Payment to supplier');

    db.prepare(`UPDATE suppliers SET current_balance = current_balance - ? WHERE id = ?`).run(
      amount,
      supplierId
    );

    if (invoiceId) {
      db.prepare(
        `UPDATE purchase_invoices SET total_remaining = MAX(0, total_remaining - ?) WHERE id = ? AND supplier_id = ?`
      ).run(amount, invoiceId, supplierId);
    }
  });

  tx();
}

export function getCustomerLedger(customerId: number, dateFrom?: string, dateTo?: string): LedgerCustomerResult {
  const companyId = getActiveCompanyId();
  if (!companyId) return { entries: [], openingBalance: 0, closingBalance: 0 };

  const customer = queryOne<{ opening_balance: number; opening_balance_type: string }>(
    'SELECT opening_balance, opening_balance_type FROM customers WHERE id = ? AND company_id = ?',
    [customerId, companyId]
  );
  if (!customer) return { entries: [], openingBalance: 0, closingBalance: 0 };

  const openingBalance = customer.opening_balance_type === 'Cr'
    ? -customer.opening_balance
    : customer.opening_balance;

  let sql = `
    SELECT le.*,
           c.name as customer_name,
           i.invoice_no,
           r.receipt_no
    FROM ledger_entries le
    LEFT JOIN customers c ON c.id = le.customer_id
    LEFT JOIN invoices i ON i.id = le.invoice_id
    LEFT JOIN receipts r ON r.id = le.receipt_id
    WHERE le.company_id = ? AND le.customer_id = ?
  `;
  const params: unknown[] = [companyId, customerId];

  if (dateFrom) {
    sql += ' AND le.entry_date >= ?';
    params.push(dateFrom);
  }
  if (dateTo) {
    sql += ' AND le.entry_date <= ?';
    params.push(dateTo);
  }

  sql += ' ORDER BY le.entry_date ASC, le.id ASC';

  const rawEntries = queryAll<LedgerEntryWithBalance>(sql, params);

  let balance = openingBalance;
  const entries: LedgerEntryWithBalance[] = rawEntries.map(entry => {
    balance += (entry.debit || 0) - (entry.credit || 0);
    return { ...entry, balance };
  });

  return { entries, openingBalance, closingBalance: balance };
}

export function getYearLedger(fyId: number, customerId?: number, entryType?: string): LedgerYearResult {
  const companyId = getActiveCompanyId();
  if (!companyId) return { entries: [], summary: { totalDebit: 0, totalCredit: 0, netBalance: 0 } };

  const fy = queryOne<{ start_date: string; end_date: string }>(
    'SELECT start_date, end_date FROM financial_years WHERE id = ?',
    [fyId]
  );
  if (!fy) return { entries: [], summary: { totalDebit: 0, totalCredit: 0, netBalance: 0 } };

  let sql = `
    SELECT le.*,
           c.name as customer_name,
           i.invoice_no,
           r.receipt_no
    FROM ledger_entries le
    LEFT JOIN customers c ON c.id = le.customer_id
    LEFT JOIN invoices i ON i.id = le.invoice_id
    LEFT JOIN receipts r ON r.id = le.receipt_id
    WHERE le.company_id = ? AND le.entry_date BETWEEN ? AND ?
  `;
  const params: unknown[] = [companyId, fy.start_date, fy.end_date];

  if (customerId) {
    sql += ' AND le.customer_id = ?';
    params.push(customerId);
  }
  if (entryType) {
    sql += ' AND le.entry_type = ?';
    params.push(entryType);
  }

  sql += ' ORDER BY le.customer_id ASC, le.entry_date ASC, le.id ASC';

  const rawEntries = queryAll<LedgerEntryWithBalance>(sql, params);

  const entries: LedgerEntryWithBalance[] = [];
  let currentCustomerId: number | null = null;
  let balance = 0;
  let totalDebit = 0;
  let totalCredit = 0;
  let openingBalance = 0;

  if (customerId != null && rawEntries.length === 0) {
    const cust = queryOne<{ opening_balance: number; opening_balance_type: string }>(
      'SELECT opening_balance, opening_balance_type FROM customers WHERE id = ? AND company_id = ?',
      [customerId, companyId]
    );
    if (cust) {
      openingBalance = cust.opening_balance_type === 'Cr' ? -cust.opening_balance : cust.opening_balance;
    }
  }

  for (const entry of rawEntries) {
    if (entry.customer_id !== currentCustomerId) {
      currentCustomerId = entry.customer_id;
      const cust = queryOne<{ opening_balance: number; opening_balance_type: string }>(
        'SELECT opening_balance, opening_balance_type FROM customers WHERE id = ? AND company_id = ?',
        [currentCustomerId, companyId]
      );
      openingBalance = cust
        ? (cust.opening_balance_type === 'Cr' ? -cust.opening_balance : cust.opening_balance)
        : 0;
      balance = openingBalance;
    }

    balance += (entry.debit || 0) - (entry.credit || 0);
    totalDebit += entry.debit || 0;
    totalCredit += entry.credit || 0;

    entries.push({ ...entry, balance });
  }

  // When a single customer is queried, netBalance is the actual closing balance
  const netBalance = customerId
    ? (rawEntries.length > 0 ? (entries[entries.length - 1]?.balance ?? 0) : openingBalance)
    : totalDebit - totalCredit;

  return {
    entries,
    summary: { totalDebit, totalCredit, netBalance, openingBalance }
  };
}

export function getInvoiceLedger(invoiceId: number): { entries: LedgerEntryWithBalance[]; invoice: Invoice | undefined; items: InvoiceItem[] } {
  const companyId = getActiveCompanyId();
  if (!companyId) return { entries: [], invoice: undefined, items: [] };

  const entries = queryAll<LedgerEntryWithBalance>(
    `SELECT le.*, c.name as customer_name, i.invoice_no
     FROM ledger_entries le
     LEFT JOIN customers c ON c.id = le.customer_id
     LEFT JOIN invoices i ON i.id = le.invoice_id
     WHERE le.invoice_id = ? AND le.company_id = ?
     ORDER BY le.entry_date ASC, le.id ASC`,
    [invoiceId, companyId]
  );

  const invoice = queryOne<Invoice>('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
  const items = queryAll<InvoiceItem>('SELECT * FROM invoice_items WHERE invoice_id = ?', [invoiceId]);

  return { entries, invoice, items };
}

export function getLedgerSummary(fyId: number): { id: number; name: string; balance: number }[] {
  const companyId = getActiveCompanyId();
  if (!companyId) return [];

  const fy = queryOne<{ start_date: string; end_date: string }>(
    'SELECT start_date, end_date FROM financial_years WHERE id = ?',
    [fyId]
  );
  if (!fy) return [];

  const customers = queryAll<{ id: number; name: string; opening_balance: number; opening_balance_type: string }>(
    'SELECT id, name, opening_balance, opening_balance_type FROM customers WHERE company_id = ?',
    [companyId]
  );

  return customers.map(cust => {
    const openingBalance = cust.opening_balance_type === 'Cr'
      ? -cust.opening_balance
      : cust.opening_balance;

    const result = queryOne<{ total_debit: number; total_credit: number }>(
      `SELECT COALESCE(SUM(debit), 0) as total_debit, COALESCE(SUM(credit), 0) as total_credit
       FROM ledger_entries
       WHERE customer_id = ? AND company_id = ? AND entry_date BETWEEN ? AND ? AND entry_type != 'OPENING_BALANCE'`,
      [cust.id, companyId, fy.start_date, fy.end_date]
    );

    const totalDebit = result?.total_debit || 0;
    const totalCredit = result?.total_credit || 0;
    const balance = openingBalance + totalDebit - totalCredit;

    return { id: cust.id, name: cust.name, balance };
  });
}
