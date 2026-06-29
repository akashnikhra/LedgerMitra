import { getDatabase, queryAll, queryOne } from './database';
import { getActiveCompanyId, getActiveFyId } from './session';
import type { Receipt, ReceiptAllocation } from '@shared/types';

export function listReceipts(filters?: { customerId?: number; invoiceId?: number; dateFrom?: string; dateTo?: string; method?: string; fyId?: number }): (Receipt & { allocation_count: number; is_legacy?: number })[] {
  const companyId = getActiveCompanyId();
  if (!companyId) return [];

  let receiptSql = `
    SELECT r.*, c.name as customer_name,
           (SELECT COUNT(*) FROM receipt_allocations ra WHERE ra.receipt_id = r.id) as allocation_count,
           0 as is_legacy
    FROM receipts r
    LEFT JOIN customers c ON c.id = r.customer_id
    WHERE r.company_id = ?
  `;
  const receiptParams: unknown[] = [companyId];

  if (filters?.customerId) { receiptSql += ' AND r.customer_id = ?'; receiptParams.push(filters.customerId); }
  if (filters?.invoiceId) { receiptSql += ' AND r.id IN (SELECT receipt_id FROM receipt_allocations WHERE invoice_id = ?)'; receiptParams.push(filters.invoiceId); }
  if (filters?.dateFrom) { receiptSql += ' AND r.receipt_date >= ?'; receiptParams.push(filters.dateFrom); }
  if (filters?.dateTo) { receiptSql += ' AND r.receipt_date <= ?'; receiptParams.push(filters.dateTo); }
  if (filters?.method) { receiptSql += ' AND r.payment_method = ?'; receiptParams.push(filters.method); }
  if (filters?.fyId) { receiptSql += ' AND r.fy_id = ?'; receiptParams.push(filters.fyId); }

  let legacySql = `
    SELECT
      le.id,
      'LEGACY-' || le.id as receipt_no,
      le.customer_id,
      le.entry_date as receipt_date,
      le.credit as amount,
      'LEGACY' as payment_method,
      NULL as reference_no,
      NULL as bank_account,
      le.narration,
      le.company_id,
      fy.id as fy_id,
      le.created_at,
      c.name as customer_name,
      0 as allocation_count,
      1 as is_legacy
    FROM ledger_entries le
    LEFT JOIN customers c ON c.id = le.customer_id
    LEFT JOIN financial_years fy ON le.entry_date BETWEEN fy.start_date AND fy.end_date AND fy.company_id = le.company_id
    WHERE le.company_id = ?
      AND le.entry_type = 'PAYMENT'
      AND le.receipt_id IS NULL
  `;
  const legacyParams: unknown[] = [companyId];

  if (filters?.customerId) { legacySql += ' AND le.customer_id = ?'; legacyParams.push(filters.customerId); }
  if (filters?.dateFrom) { legacySql += ' AND le.entry_date >= ?'; legacyParams.push(filters.dateFrom); }
  if (filters?.dateTo) { legacySql += ' AND le.entry_date <= ?'; legacyParams.push(filters.dateTo); }
  if (filters?.fyId) { legacySql += ' AND fy.id = ?'; legacyParams.push(filters.fyId); }
  if (filters?.method) { legacySql += ' AND 1 = 0'; }

  legacySql += ' ORDER BY le.entry_date DESC, le.id DESC';
  receiptSql += ' ORDER BY r.receipt_date DESC, r.id DESC';

  const allReceipts = queryAll(receiptSql, receiptParams);
  const legacyPayments = queryAll(legacySql, legacyParams);

  const combined = [...allReceipts, ...legacyPayments];
  combined.sort((a, b) => {
    const dateA = (a.receipt_date || '') as string;
    const dateB = (b.receipt_date || '') as string;
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    return ((b.id || 0) as number) - ((a.id || 0) as number);
  });

  return combined as (Receipt & { allocation_count: number; is_legacy?: number })[];
}

export function getReceipt(id: number): { receipt: Receipt; allocations: ReceiptAllocation[] } | null {
  const companyId = getActiveCompanyId();
  if (!companyId) return null;

  const receipt = queryOne<Receipt>(
    'SELECT r.*, c.name as customer_name FROM receipts r LEFT JOIN customers c ON c.id = r.customer_id WHERE r.id = ? AND r.company_id = ?',
    [id, companyId]
  );
  if (!receipt) return null;

  const allocations = queryAll<ReceiptAllocation>(
    `SELECT ra.*, i.invoice_no, i.invoice_date, i.total_amount as invoice_total, i.total_remaining as invoice_remaining
     FROM receipt_allocations ra
     JOIN invoices i ON i.id = ra.invoice_id
     WHERE ra.receipt_id = ? AND i.company_id = ?`,
    [id, companyId]
  );

  return { receipt, allocations };
}

export function generateReceiptNo(date: string): string {
  const db = getDatabase();
  const prefix = (queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'receipt_prefix'")?.value) || 'REC';
  const dateStr = date.replace(/-/g, '');
  const seqKey = `receipt_sequence_${dateStr}`;

  const existing = queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [seqKey]);
  const seq = existing ? parseInt(existing.value, 10) + 1 : 1;

  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(seqKey, String(seq));

  return `${prefix}-${dateStr}-${String(seq).padStart(3, '0')}`;
}

export function getReceiptAllocations(receiptId: number): { invoice_id: number; allocated_amount: number; invoice_no: string }[] {
  const companyId = getActiveCompanyId();
  if (!companyId) return [];
  return queryAll(
    `SELECT ra.invoice_id, ra.allocated_amount, i.invoice_no
     FROM receipt_allocations ra
     JOIN invoices i ON i.id = ra.invoice_id
     WHERE ra.receipt_id = ? AND i.company_id = ?`,
    [receiptId, companyId]
  ) as { invoice_id: number; allocated_amount: number; invoice_no: string }[];
}

export function getOutstandingInvoices(customerId: number): { id: number; invoice_no: string; invoice_date: string; total_amount: number; total_remaining: number }[] {
  const companyId = getActiveCompanyId();
  if (!companyId) return [];

  return queryAll(
    `SELECT id, invoice_no, invoice_date, total_amount, total_remaining
     FROM invoices
     WHERE customer_id = ? AND company_id = ? AND total_remaining > 0
     ORDER BY invoice_date ASC`,
    [customerId, companyId]
  ) as { id: number; invoice_no: string; invoice_date: string; total_amount: number; total_remaining: number }[];
}

export function createReceipt(data: {
  customer_id: number;
  receipt_date: string;
  amount: number;
  payment_method: Receipt['payment_method'];
  reference_no?: string;
  bank_account?: string;
  narration?: string;
  allocations: { invoice_id: number; allocated_amount: number }[];
}): { receipt: Receipt; allocations: ReceiptAllocation[] } {
  const companyId = getActiveCompanyId()!;
  const fyId = getActiveFyId();
  const db = getDatabase();

  if (data.amount <= 0) throw new Error('Receipt amount must be positive');
  const totalAllocated = data.allocations.reduce((sum, a) => sum + a.allocated_amount, 0);
  if (totalAllocated > data.amount) throw new Error('Total allocations exceed receipt amount');

  const receiptNo = generateReceiptNo(data.receipt_date);
  let receiptId: number;

  const tx = db.transaction(() => {
    const result = db.prepare(
      `INSERT INTO receipts (receipt_no, customer_id, receipt_date, amount, payment_method, reference_no, bank_account, narration, company_id, fy_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(receiptNo, data.customer_id, data.receipt_date, data.amount, data.payment_method, data.reference_no || null, data.bank_account || null, data.narration || null, companyId, fyId || null);

    receiptId = result.lastInsertRowid as number;

    for (const alloc of data.allocations) {
      if (alloc.invoice_id <= 0) continue;
      db.prepare(
        'INSERT INTO receipt_allocations (receipt_id, invoice_id, allocated_amount) VALUES (?, ?, ?)'
      ).run(receiptId, alloc.invoice_id, alloc.allocated_amount);

      db.prepare(
        'UPDATE invoices SET total_remaining = total_remaining - ? WHERE id = ?'
      ).run(alloc.allocated_amount, alloc.invoice_id);
    }

    db.prepare(
      `INSERT INTO ledger_entries (entry_date, customer_id, entry_type, credit, company_id, narration, receipt_id)
       VALUES (?, ?, 'RECEIPT', ?, ?, ?, ?)`
    ).run(data.receipt_date, data.customer_id, data.amount, companyId, data.narration || 'Payment received', receiptId);

    db.prepare(
      'UPDATE customers SET current_balance = current_balance - ? WHERE id = ?'
    ).run(data.amount, data.customer_id);
  });

  tx();

  return getReceipt(receiptId)!;
}

export function updateReceipt(id: number, data: {
  customer_id: number;
  receipt_date: string;
  amount: number;
  payment_method: Receipt['payment_method'];
  reference_no?: string;
  bank_account?: string;
  narration?: string;
  allocations: { invoice_id: number; allocated_amount: number }[];
}): { receipt: Receipt; allocations: ReceiptAllocation[] } {
  const companyId = getActiveCompanyId()!;
  const db = getDatabase();

  const oldReceipt = queryOne<Receipt>('SELECT * FROM receipts WHERE id = ? AND company_id = ?', [id, companyId]);
  if (!oldReceipt) throw new Error('Receipt not found');

  if (data.amount <= 0) throw new Error('Receipt amount must be positive');
  const totalAllocated = data.allocations.reduce((sum, a) => sum + a.allocated_amount, 0);
  if (totalAllocated > data.amount) throw new Error('Total allocations exceed receipt amount');

  const oldAllocations = queryAll<ReceiptAllocation>('SELECT * FROM receipt_allocations WHERE receipt_id = ?', [id]);

  const tx = db.transaction(() => {
    for (const alloc of oldAllocations) {
      db.prepare('UPDATE invoices SET total_remaining = total_remaining + ? WHERE id = ?')
        .run(alloc.allocated_amount, alloc.invoice_id);
    }

    db.prepare('UPDATE customers SET current_balance = current_balance + ? WHERE id = ?')
      .run(oldReceipt.amount, oldReceipt.customer_id);

    db.prepare('DELETE FROM receipt_allocations WHERE receipt_id = ?').run(id);
    db.prepare('DELETE FROM ledger_entries WHERE receipt_id = ?').run(id);

    db.prepare(
      `UPDATE receipts SET customer_id = ?, receipt_date = ?, amount = ?, payment_method = ?, reference_no = ?, bank_account = ?, narration = ? WHERE id = ?`
    ).run(data.customer_id, data.receipt_date, data.amount, data.payment_method, data.reference_no || null, data.bank_account || null, data.narration || null, id);

    for (const alloc of data.allocations) {
      if (alloc.invoice_id <= 0) continue;
      db.prepare('INSERT INTO receipt_allocations (receipt_id, invoice_id, allocated_amount) VALUES (?, ?, ?)')
        .run(id, alloc.invoice_id, alloc.allocated_amount);
      db.prepare('UPDATE invoices SET total_remaining = total_remaining - ? WHERE id = ?')
        .run(alloc.allocated_amount, alloc.invoice_id);
    }

    db.prepare(
      `INSERT INTO ledger_entries (entry_date, customer_id, entry_type, credit, company_id, narration, receipt_id)
       VALUES (?, ?, 'RECEIPT', ?, ?, ?, ?)`
    ).run(data.receipt_date, data.customer_id, data.amount, companyId, data.narration || 'Payment received', id);

    db.prepare('UPDATE customers SET current_balance = current_balance - ? WHERE id = ?')
      .run(data.amount, data.customer_id);
  });

  tx();

  return getReceipt(id)!;
}

export function deleteReceipt(id: number): void {
  const companyId = getActiveCompanyId()!;
  const db = getDatabase();

  const receipt = queryOne<Receipt>('SELECT * FROM receipts WHERE id = ? AND company_id = ?', [id, companyId]);
  if (!receipt) throw new Error('Receipt not found');

  const allocations = queryAll<ReceiptAllocation>('SELECT * FROM receipt_allocations WHERE receipt_id = ?', [id]);

  const tx = db.transaction(() => {
    for (const alloc of allocations) {
      db.prepare(
        'UPDATE invoices SET total_remaining = total_remaining + ? WHERE id = ?'
      ).run(alloc.allocated_amount, alloc.invoice_id);
    }

    db.prepare('DELETE FROM receipt_allocations WHERE receipt_id = ?').run(id);
    db.prepare('DELETE FROM ledger_entries WHERE receipt_id = ?').run(id);

    db.prepare(
      'UPDATE customers SET current_balance = current_balance + ? WHERE id = ?'
    ).run(receipt.amount, receipt.customer_id);

    db.prepare('DELETE FROM receipts WHERE id = ?').run(id);
  });

  tx();
}

export function autoAllocate(customerId: number, amount: number): { invoice_id: number; allocated_amount: number }[] {
  const invoices = getOutstandingInvoices(customerId);
  const allocations: { invoice_id: number; allocated_amount: number }[] = [];
  let remaining = amount;

  for (const inv of invoices) {
    if (remaining <= 0) break;
    const allocAmount = Math.min(remaining, inv.total_remaining);
    allocations.push({ invoice_id: inv.id, allocated_amount: allocAmount });
    remaining -= allocAmount;
  }

  return allocations;
}
