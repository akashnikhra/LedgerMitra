# Payment Receipts, Credit Notes, Ledger & Print System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add payment receipts, credit notes, enhanced ledger views, and print/PDF system to LedgerMitra, working with both native and legacy-imported data.

**Architecture:** Incremental approach — new SQLite tables (receipts, receipt_allocations, credit_notes), extended ledger_entries with new entry types, IPC handlers, React panels/modals, and dual-mode print system (browser print + Electron PDF).

**Tech Stack:** Electron, React 18, TypeScript, better-sqlite3, Vite 6

---

## File Structure

| File | Responsibility |
|---|---|
| `src/shared/types.ts` | New interfaces: Receipt, ReceiptAllocation, CreditNote, extended LedgerEntry |
| `src/shared/constants.ts` | New IPC channel constants |
| `src/main/database.ts` | Migration blocks for new tables/columns |
| `src/main/receipt.ts` | Receipt CRUD, allocation, numbering, auto-allocate |
| `src/main/credit-note.ts` | Credit note CRUD, apply, cancel, numbering |
| `src/main/print.ts` | Print template rendering, PDF generation |
| `src/main/ledger.ts` | Extended: customer ledger, year ledger, running balance |
| `src/main/ipc-handlers.ts` | Register new IPC handlers |
| `src/main/preload.ts` | Expose new APIs to renderer |
| `src/renderer/components/ReceiptsPanel.tsx` | Receipt list with filters |
| `src/renderer/components/ReceiptModal.tsx` | Receipt create/edit form |
| `src/renderer/components/AllocationTable.tsx` | Invoice allocation editor |
| `src/renderer/components/CreditNotesPanel.tsx` | Credit note list with filters |
| `src/renderer/components/CreditNoteModal.tsx` | Credit note create form |
| `src/renderer/components/ApplyCreditNoteModal.tsx` | Apply standalone CN to invoice |
| `src/renderer/components/LedgerPanel.tsx` | Ledger view (customer/year toggle) |
| `src/renderer/components/LedgerFilters.tsx` | Filter controls |
| `src/renderer/components/LedgerTable.tsx` | Entry table with running balance |
| `src/renderer/components/LedgerSummary.tsx` | Totals and balance cards |
| `src/renderer/components/InvoiceDrillDown.tsx` | Expandable invoice line items |
| `src/renderer/components/PrintPreviewModal.tsx` | Print preview + Print/Save PDF |
| `src/renderer/components/InvoicePrintView.tsx` | Invoice print template |
| `src/renderer/components/ReceiptPrintView.tsx` | Receipt print template |
| `src/renderer/components/CreditNotePrintView.tsx` | CN print template |
| `src/renderer/components/LedgerPrintView.tsx` | Ledger print template |
| `src/renderer/components/Dashboard.tsx` | Add new tabs: receipts, credit-notes, ledger |
| `src/renderer/styles/global.css` | Print CSS, new component styles |

---

### Task 1: Shared Types & IPC Constants

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/constants.ts`

- [ ] **Step 1: Add new interfaces to `src/shared/types.ts`**

Append after line 164 (after `MdbImportResult`):

```typescript
export interface Receipt {
  id: number;
  receipt_no: string;
  customer_id: number;
  receipt_date: string;
  amount: number;
  payment_method: 'CASH' | 'UPI' | 'CHEQUE' | 'BANK_TRANSFER' | 'OTHER';
  reference_no?: string;
  bank_account?: string;
  narration?: string;
  company_id?: number;
  fy_id?: number;
  customer_name?: string;
  created_at?: string;
}

export interface ReceiptAllocation {
  id: number;
  receipt_id: number;
  invoice_id: number;
  allocated_amount: number;
  invoice_no?: string;
  invoice_date?: string;
  invoice_total?: number;
  invoice_remaining?: number;
}

export interface CreditNote {
  id: number;
  cn_no: string;
  customer_id: number;
  invoice_id?: number;
  cn_date: string;
  amount: number;
  reason?: string;
  narration?: string;
  status: 'ACTIVE' | 'APPLIED' | 'CANCELLED';
  company_id?: number;
  fy_id?: number;
  customer_name?: string;
  invoice_no?: string;
  created_at?: string;
}

export interface LedgerEntryWithBalance extends LedgerEntry {
  balance?: number;
  customer_name?: string;
  invoice_no?: string;
  receipt_no?: string;
  cn_no?: string;
}

export interface LedgerCustomerResult {
  entries: LedgerEntryWithBalance[];
  openingBalance: number;
  closingBalance: number;
}

export interface LedgerYearResult {
  entries: LedgerEntryWithBalance[];
  summary: { totalDebit: number; totalCredit: number; netBalance: number };
}

export interface PrintTemplateData {
  type: 'invoice' | 'receipt' | 'credit-note' | 'ledger';
  data: Record<string, unknown>;
}
```

- [ ] **Step 2: Extend LedgerEntry interface in `src/shared/types.ts`**

Replace the existing `LedgerEntry` interface (lines 128-137):

```typescript
export interface LedgerEntry {
  id: number;
  entry_date: string;
  customer_id?: number;
  invoice_id?: number;
  receipt_id?: number;
  cn_id?: number;
  entry_type: string;
  debit?: number;
  credit?: number;
  narration?: string;
}
```

- [ ] **Step 3: Add IPC constants to `src/shared/constants.ts`**

Add these entries inside the `IPC_CHANNELS` object (before the closing `} as const;` on line 51):

```typescript
  // Receipts
  'receipt:list': 'receipt:list',
  'receipt:get': 'receipt:get',
  'receipt:create': 'receipt:create',
  'receipt:delete': 'receipt:delete',
  'receipt:outstanding': 'receipt:outstanding',
  'receipt:generate-no': 'receipt:generate-no',

  // Credit Notes
  'credit-note:list': 'credit-note:list',
  'credit-note:get': 'credit-note:get',
  'credit-note:create': 'credit-note:create',
  'credit-note:apply': 'credit-note:apply',
  'credit-note:cancel': 'credit-note:cancel',
  'credit-note:outstanding': 'credit-note:outstanding',
  'credit-note:generate-no': 'credit-note:generate-no',

  // Ledger (extended)
  'ledger:customer': 'ledger:customer',
  'ledger:year': 'ledger:year',
  'ledger:by-invoice': 'ledger:by-invoice',
  'ledger:summary': 'ledger:summary',

  // Print
  'print:invoice': 'print:invoice',
  'print:receipt': 'print:receipt',
  'print:credit-note': 'print:credit-note',
  'print:ledger': 'print:ledger',
  'print:save-pdf': 'print:save-pdf',

  // Settings
  'setting:get': 'setting:get',
  'setting:set': 'setting:set',
```

- [ ] **Step 4: Verify build passes**

Run: `npm run build`
Expected: All 3 targets build without errors.

---

### Task 2: Database Migrations

**Files:**
- Modify: `src/main/database.ts`

- [ ] **Step 1: Add migration blocks to `src/main/database.ts`**

Add these migration blocks after the existing migrations (after line 81, before the user creation block):

```typescript
  // Migration: Add receipt_id and cn_id to ledger_entries
  try {
    const ledgerCols = db.prepare("PRAGMA table_info(ledger_entries)").all() as Array<{ name: string }>;
    if (!ledgerCols.some((col) => col.name === 'receipt_id')) {
      db.exec('ALTER TABLE ledger_entries ADD COLUMN receipt_id INTEGER REFERENCES receipts(id)');
      console.log('[Migration] Added receipt_id to ledger_entries');
    }
    if (!ledgerCols.some((col) => col.name === 'cn_id')) {
      db.exec('ALTER TABLE ledger_entries ADD COLUMN cn_id INTEGER REFERENCES credit_notes(id)');
      console.log('[Migration] Added cn_id to ledger_entries');
    }
  } catch (e) {
    console.error('Migration error:', e);
  }

  // Migration: Create receipts table
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS receipts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        receipt_no VARCHAR(30) UNIQUE NOT NULL,
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        receipt_date DATE NOT NULL,
        amount DECIMAL(15,2) NOT NULL,
        payment_method VARCHAR(20) NOT NULL,
        reference_no VARCHAR(50),
        bank_account VARCHAR(50),
        narration TEXT,
        company_id INTEGER REFERENCES company(id),
        fy_id INTEGER REFERENCES financial_years(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[Migration] Created receipts table');
  } catch (e) {
    console.error('Migration error:', e);
  }

  // Migration: Create receipt_allocations table
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS receipt_allocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        receipt_id INTEGER NOT NULL REFERENCES receipts(id),
        invoice_id INTEGER NOT NULL REFERENCES invoices(id),
        allocated_amount DECIMAL(15,2) NOT NULL,
        UNIQUE(receipt_id, invoice_id)
      )
    `);
    console.log('[Migration] Created receipt_allocations table');
  } catch (e) {
    console.error('Migration error:', e);
  }

  // Migration: Create credit_notes table
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS credit_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cn_no VARCHAR(30) UNIQUE NOT NULL,
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        invoice_id INTEGER REFERENCES invoices(id),
        cn_date DATE NOT NULL,
        amount DECIMAL(15,2) NOT NULL,
        reason TEXT,
        narration TEXT,
        status VARCHAR(20) DEFAULT 'ACTIVE',
        company_id INTEGER REFERENCES company(id),
        fy_id INTEGER REFERENCES financial_years(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[Migration] Created credit_notes table');
  } catch (e) {
    console.error('Migration error:', e);
  }

  // Migration: Initialize default settings for receipt/CN prefixes
  try {
    const existingKeys = db.prepare("SELECT key FROM settings").all() as Array<{ key: string }>;
    const keySet = new Set(existingKeys.map(k => k.key));
    if (!keySet.has('receipt_prefix')) {
      db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run('receipt_prefix', 'REC');
    }
    if (!keySet.has('cn_prefix')) {
      db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run('cn_prefix', 'CN');
    }
    console.log('[Migration] Initialized default print settings');
  } catch (e) {
    console.error('Migration error:', e);
  }
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: All 3 targets build without errors.

---

### Task 3: Receipt Module (Main Process)

**Files:**
- Create: `src/main/receipt.ts`

- [ ] **Step 1: Create `src/main/receipt.ts`**

```typescript
import { getDatabase, queryAll, queryOne } from './database';
import { getActiveCompanyId, getActiveFyId } from './session';
import type { Receipt, ReceiptAllocation } from '@shared/types';

export function listReceipts(filters?: { customerId?: number; dateFrom?: string; dateTo?: string; method?: string }): (Receipt & { allocation_count: number })[] {
  const companyId = getActiveCompanyId();
  if (!companyId) return [];

  let sql = `
    SELECT r.*, c.name as customer_name,
           (SELECT COUNT(*) FROM receipt_allocations ra WHERE ra.receipt_id = r.id) as allocation_count
    FROM receipts r
    LEFT JOIN customers c ON c.id = r.customer_id
    WHERE r.company_id = ?
  `;
  const params: unknown[] = [companyId];

  if (filters?.customerId) {
    sql += ' AND r.customer_id = ?';
    params.push(filters.customerId);
  }
  if (filters?.dateFrom) {
    sql += ' AND r.receipt_date >= ?';
    params.push(filters.dateFrom);
  }
  if (filters?.dateTo) {
    sql += ' AND r.receipt_date <= ?';
    params.push(filters.dateTo);
  }
  if (filters?.method) {
    sql += ' AND r.payment_method = ?';
    params.push(filters.method);
  }

  sql += ' ORDER BY r.receipt_date DESC, r.id DESC';
  return queryAll(sql, params) as (Receipt & { allocation_count: number })[];
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
     WHERE ra.receipt_id = ?`,
    [id]
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
  payment_method: string;
  reference_no?: string;
  bank_account?: string;
  narration?: string;
  allocations: { invoice_id: number; allocated_amount: number }[];
}): { receipt: Receipt; allocations: ReceiptAllocation[] } {
  const companyId = getActiveCompanyId()!;
  const fyId = getActiveFyId();
  const db = getDatabase();

  const receiptNo = generateReceiptNo(data.receipt_date);

  const tx = db.transaction(() => {
    // Insert receipt
    const result = db.prepare(
      `INSERT INTO receipts (receipt_no, customer_id, receipt_date, amount, payment_method, reference_no, bank_account, narration, company_id, fy_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(receiptNo, data.customer_id, data.receipt_date, data.amount, data.payment_method, data.reference_no || null, data.bank_account || null, data.narration || null, companyId, fyId || null);

    const receiptId = result.lastInsertRowid as number;

    // Insert allocations and update invoices
    for (const alloc of data.allocations) {
      db.prepare(
        'INSERT INTO receipt_allocations (receipt_id, invoice_id, allocated_amount) VALUES (?, ?, ?)'
      ).run(receiptId, alloc.invoice_id, alloc.allocated_amount);

      db.prepare(
        'UPDATE invoices SET total_remaining = total_remaining - ? WHERE id = ?'
      ).run(alloc.allocated_amount, alloc.invoice_id);
    }

    // Create ledger entry
    db.prepare(
      `INSERT INTO ledger_entries (entry_date, customer_id, entry_type, credit, company_id, narration, receipt_id)
       VALUES (?, ?, 'RECEIPT', ?, ?, ?, ?)`
    ).run(data.receipt_date, data.customer_id, data.amount, companyId, data.narration || 'Payment received', receiptId);

    // Update customer balance
    db.prepare(
      'UPDATE customers SET current_balance = current_balance - ? WHERE id = ?'
    ).run(data.amount, data.customer_id);
  });

  tx();

  return getReceipt(receiptId as number)!;
}

export function deleteReceipt(id: number): void {
  const companyId = getActiveCompanyId()!;
  const db = getDatabase();

  const receipt = queryOne<Receipt>('SELECT * FROM receipts WHERE id = ? AND company_id = ?', [id, companyId]);
  if (!receipt) throw new Error('Receipt not found');

  const allocations = queryAll<ReceiptAllocation>('SELECT * FROM receipt_allocations WHERE receipt_id = ?', [id]);

  const tx = db.transaction(() => {
    // Reverse invoice balances
    for (const alloc of allocations) {
      db.prepare(
        'UPDATE invoices SET total_remaining = total_remaining + ? WHERE id = ?'
      ).run(alloc.allocated_amount, alloc.invoice_id);
    }

    // Delete allocations
    db.prepare('DELETE FROM receipt_allocations WHERE receipt_id = ?').run(id);

    // Delete ledger entry
    db.prepare('DELETE FROM ledger_entries WHERE receipt_id = ?').run(id);

    // Restore customer balance
    db.prepare(
      'UPDATE customers SET current_balance = current_balance + ? WHERE id = ?'
    ).run(receipt.amount, receipt.customer_id);

    // Delete receipt
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
```

- [ ] **Step 2: Add `getActiveFyId` to `src/main/session.ts` if not present**

Read `src/main/session.ts`. If `getActiveFyId` does not exist, add:

```typescript
export function getActiveFyId(): number | null {
  const workspace = getWorkspace();
  return workspace?.fyId || null;
}
```

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: All 3 targets build without errors.

---

### Task 4: Credit Note Module (Main Process)

**Files:**
- Create: `src/main/credit-note.ts`

- [ ] **Step 1: Create `src/main/credit-note.ts`**

```typescript
import { getDatabase, queryAll, queryOne } from './database';
import { getActiveCompanyId, getActiveFyId } from './session';
import type { CreditNote } from '@shared/types';

export function listCreditNotes(filters?: { customerId?: number; dateFrom?: string; dateTo?: string; status?: string }): CreditNote[] {
  const companyId = getActiveCompanyId();
  if (!companyId) return [];

  let sql = `
    SELECT cn.*, c.name as customer_name, i.invoice_no
    FROM credit_notes cn
    LEFT JOIN customers c ON c.id = cn.customer_id
    LEFT JOIN invoices i ON i.id = cn.invoice_id
    WHERE cn.company_id = ?
  `;
  const params: unknown[] = [companyId];

  if (filters?.customerId) {
    sql += ' AND cn.customer_id = ?';
    params.push(filters.customerId);
  }
  if (filters?.dateFrom) {
    sql += ' AND cn.cn_date >= ?';
    params.push(filters.dateFrom);
  }
  if (filters?.dateTo) {
    sql += ' AND cn.cn_date <= ?';
    params.push(filters.dateTo);
  }
  if (filters?.status) {
    sql += ' AND cn.status = ?';
    params.push(filters.status);
  }

  sql += ' ORDER BY cn.cn_date DESC, cn.id DESC';
  return queryAll(sql, params) as CreditNote[];
}

export function getCreditNote(id: number): CreditNote | null {
  const companyId = getActiveCompanyId();
  if (!companyId) return null;

  return queryOne<CreditNote>(
    `SELECT cn.*, c.name as customer_name, i.invoice_no
     FROM credit_notes cn
     LEFT JOIN customers c ON c.id = cn.customer_id
     LEFT JOIN invoices i ON i.id = cn.invoice_id
     WHERE cn.id = ? AND cn.company_id = ?`,
    [id, companyId]
  );
}

export function generateCnNo(date: string): string {
  const db = getDatabase();
  const prefix = (queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'cn_prefix'")?.value) || 'CN';
  const dateStr = date.replace(/-/g, '');
  const seqKey = `cn_sequence_${dateStr}`;

  const existing = queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [seqKey]);
  const seq = existing ? parseInt(existing.value, 10) + 1 : 1;

  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(seqKey, String(seq));

  return `${prefix}-${dateStr}-${String(seq).padStart(3, '0')}`;
}

export function createCreditNote(data: {
  customer_id: number;
  invoice_id?: number;
  cn_date: string;
  amount: number;
  reason?: string;
  narration?: string;
}): CreditNote {
  const companyId = getActiveCompanyId()!;
  const fyId = getActiveFyId();
  const db = getDatabase();

  const cnNo = generateCnNo(data.cn_date);
  const status = data.invoice_id ? 'APPLIED' : 'ACTIVE';

  const tx = db.transaction(() => {
    // Insert credit note
    db.prepare(
      `INSERT INTO credit_notes (cn_no, customer_id, invoice_id, cn_date, amount, reason, narration, status, company_id, fy_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(cnNo, data.customer_id, data.invoice_id || null, data.cn_date, data.amount, data.reason || null, data.narration || null, status, companyId, fyId || null);

    // If linked to invoice, reduce invoice remaining
    if (data.invoice_id) {
      db.prepare(
        'UPDATE invoices SET total_remaining = total_remaining - ? WHERE id = ?'
      ).run(data.amount, data.invoice_id);
    }

    // Create ledger entry
    db.prepare(
      `INSERT INTO ledger_entries (entry_date, customer_id, invoice_id, entry_type, credit, company_id, narration, cn_id)
       VALUES (?, ?, ?, 'CREDIT_NOTE', ?, ?, ?, ?)`
    ).run(data.cn_date, data.customer_id, data.invoice_id || null, data.amount, companyId, data.narration || 'Credit note issued', db.prepare('SELECT last_insert_rowid() as id').get() as { id: number });

    // Update customer balance
    db.prepare(
      'UPDATE customers SET current_balance = current_balance - ? WHERE id = ?'
    ).run(data.amount, data.customer_id);
  });

  tx();

  return getCreditNote(db.prepare('SELECT last_insert_rowid() as id').get() as { id: number })!;
}

export function applyCreditNote(cnId: number, invoiceId: number): void {
  const companyId = getActiveCompanyId()!;
  const db = getDatabase();

  const cn = queryOne<CreditNote>('SELECT * FROM credit_notes WHERE id = ? AND company_id = ? AND status = ?', [cnId, companyId, 'ACTIVE']);
  if (!cn) throw new Error('Credit note not found or not active');

  const invoice = queryOne<{ id: number; total_remaining: number }>('SELECT id, total_remaining FROM invoices WHERE id = ? AND company_id = ?', [invoiceId, companyId]);
  if (!invoice) throw new Error('Invoice not found');
  if (invoice.total_remaining <= 0) throw new Error('Invoice is fully paid');

  const tx = db.transaction(() => {
    // Update invoice
    db.prepare(
      'UPDATE invoices SET total_remaining = total_remaining - ? WHERE id = ?'
    ).run(cn.amount, invoiceId);

    // Create ledger entry
    db.prepare(
      `INSERT INTO ledger_entries (entry_date, customer_id, invoice_id, entry_type, debit, credit, company_id, narration, cn_id)
       VALUES (?, ?, ?, 'CREDIT_APPLIED', ?, ?, ?, ?, ?)`
    ).run(cn.cn_date, cn.customer_id, invoiceId, cn.amount, cn.amount, companyId, `Credit note ${cn.cn_no} applied`, cnId);

    // Update CN status
    db.prepare('UPDATE credit_notes SET status = ? WHERE id = ?').run('APPLIED', cnId);
  });

  tx();
}

export function cancelCreditNote(cnId: number): void {
  const companyId = getActiveCompanyId()!;
  const db = getDatabase();

  const cn = queryOne<CreditNote>('SELECT * FROM credit_notes WHERE id = ? AND company_id = ? AND status != ?', [cnId, companyId, 'CANCELLED']);
  if (!cn) throw new Error('Credit note not found or already cancelled');

  const tx = db.transaction(() => {
    // If was applied, restore invoice balance
    if (cn.status === 'APPLIED' && cn.invoice_id) {
      db.prepare(
        'UPDATE invoices SET total_remaining = total_remaining + ? WHERE id = ?'
      ).run(cn.amount, cn.invoice_id);
    }

    // Create reversal ledger entry
    db.prepare(
      `INSERT INTO ledger_entries (entry_date, customer_id, invoice_id, entry_type, debit, company_id, narration, cn_id)
       VALUES (?, ?, ?, 'CN_CANCELLED', ?, ?, ?, ?)`
    ).run(cn.cn_date, cn.customer_id, cn.invoice_id || null, cn.amount, companyId, `Credit note ${cn.cn_no} cancelled`, cnId);

    // Restore customer balance
    db.prepare(
      'UPDATE customers SET current_balance = current_balance + ? WHERE id = ?'
    ).run(cn.amount, cn.customer_id);

    // Update CN status
    db.prepare('UPDATE credit_notes SET status = ? WHERE id = ?').run('CANCELLED', cnId);
  });

  tx();
}

export function getActiveCreditNotes(customerId: number): CreditNote[] {
  const companyId = getActiveCompanyId();
  if (!companyId) return [];

  return queryAll<CreditNote>(
    `SELECT cn.*, c.name as customer_name, i.invoice_no
     FROM credit_notes cn
     LEFT JOIN customers c ON c.id = cn.customer_id
     LEFT JOIN invoices i ON i.id = cn.invoice_id
     WHERE cn.customer_id = ? AND cn.company_id = ? AND cn.status = 'ACTIVE'
     ORDER BY cn.cn_date ASC`,
    [customerId, companyId]
  );
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: All 3 targets build without errors.

---

### Task 5: Extended Ledger Module (Main Process)

**Files:**
- Modify: `src/main/ledger.ts`

- [ ] **Step 1: Replace `src/main/ledger.ts` with extended version**

```typescript
import { queryAll, queryOne, executeWrite, getDatabase } from './database';
import { getActiveCompanyId } from './session';
import type { LedgerEntry, LedgerEntryWithBalance, LedgerCustomerResult, LedgerYearResult } from '@shared/types';

export function getLedgerEntries(customerId?: number): LedgerEntry[] {
  const companyId = getActiveCompanyId();
  if (!companyId) return [];
  if (customerId) {
    return queryAll<LedgerEntry>(
      `SELECT * FROM ledger_entries WHERE company_id = ? AND customer_id = ?
       ORDER BY entry_date DESC, id DESC`,
      [companyId, customerId]
    );
  }
  return queryAll<LedgerEntry>(
    'SELECT * FROM ledger_entries WHERE company_id = ? ORDER BY entry_date DESC',
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
    'SELECT opening_balance, opening_balance_type FROM customers WHERE id = ?',
    [customerId]
  );
  if (!customer) return { entries: [], openingBalance: 0, closingBalance: 0 };

  const openingBalance = customer.opening_balance_type === 'Cr'
    ? -customer.opening_balance
    : customer.opening_balance;

  let sql = `
    SELECT le.*,
           c.name as customer_name,
           i.invoice_no,
           r.receipt_no,
           cn.cn_no
    FROM ledger_entries le
    LEFT JOIN customers c ON c.id = le.customer_id
    LEFT JOIN invoices i ON i.id = le.invoice_id
    LEFT JOIN receipts r ON r.id = le.receipt_id
    LEFT JOIN credit_notes cn ON cn.id = le.cn_id
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

  // Compute running balance
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
           r.receipt_no,
           cn.cn_no
    FROM ledger_entries le
    LEFT JOIN customers c ON c.id = le.customer_id
    LEFT JOIN invoices i ON i.id = le.invoice_id
    LEFT JOIN receipts r ON r.id = le.receipt_id
    LEFT JOIN credit_notes cn ON cn.id = le.cn_id
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

  // Compute running balance per customer
  const entries: LedgerEntryWithBalance[] = [];
  let currentCustomerId: number | null = null;
  let balance = 0;
  let totalDebit = 0;
  let totalCredit = 0;

  for (const entry of rawEntries) {
    if (entry.customer_id !== currentCustomerId) {
      // Reset balance at customer boundary
      currentCustomerId = entry.customer_id;
      const cust = queryOne<{ opening_balance: number; opening_balance_type: string }>(
        'SELECT opening_balance, opening_balance_type FROM customers WHERE id = ?',
        [currentCustomerId]
      );
      balance = cust
        ? (cust.opening_balance_type === 'Cr' ? -cust.opening_balance : cust.opening_balance)
        : 0;
    }

    balance += (entry.debit || 0) - (entry.credit || 0);
    totalDebit += entry.debit || 0;
    totalCredit += entry.credit || 0;

    entries.push({ ...entry, balance });
  }

  return {
    entries,
    summary: { totalDebit, totalCredit, netBalance: totalDebit - totalCredit }
  };
}

export function getInvoiceLedger(invoiceId: number): { entries: LedgerEntryWithBalance[]; invoice: unknown; items: unknown[] } {
  const companyId = getActiveCompanyId();
  if (!companyId) return { entries: [], invoice: null, items: [] };

  const entries = queryAll<LedgerEntryWithBalance>(
    `SELECT le.*, c.name as customer_name, i.invoice_no
     FROM ledger_entries le
     LEFT JOIN customers c ON c.id = le.customer_id
     LEFT JOIN invoices i ON i.id = le.invoice_id
     WHERE le.invoice_id = ? AND le.company_id = ?
     ORDER BY le.entry_date ASC, le.id ASC`,
    [invoiceId, companyId]
  );

  const invoice = queryOne('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
  const items = queryAll('SELECT * FROM invoice_items WHERE invoice_id = ?', [invoiceId]);

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
       WHERE customer_id = ? AND company_id = ? AND entry_date BETWEEN ? AND ?`,
      [cust.id, companyId, fy.start_date, fy.end_date]
    );

    const totalDebit = result?.total_debit || 0;
    const totalCredit = result?.total_credit || 0;
    const balance = openingBalance + totalDebit - totalCredit;

    return { id: cust.id, name: cust.name, balance };
  });
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: All 3 targets build without errors.

---

### Task 6: Print Module (Main Process)

**Files:**
- Create: `src/main/print.ts`

- [ ] **Step 1: Create `src/main/print.ts`**

```typescript
import { queryOne } from './database';
import { getActiveCompanyId } from './session';
import { BrowserWindow } from 'electron';
import { join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

export function getCompanyInfo(): { name: string; address?: string; phone?: string; email?: string; gstin?: string; pan?: string; state?: string } | null {
  const companyId = getActiveCompanyId();
  if (!companyId) return null;
  return queryOne('SELECT * FROM company WHERE id = ?', [companyId]) as { name: string; address?: string; phone?: string; email?: string; gstin?: string; pan?: string; state?: string } | null;
}

export function formatCurrency(amount: number): string {
  return `₹ ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function renderInvoiceTemplate(data: Record<string, unknown>): string {
  const invoice = data.invoice as Record<string, unknown>;
  const items = data.items as Record<string, unknown>[];
  const company = data.company as Record<string, unknown>;
  const customer = data.customer as Record<string, unknown>;
  const paymentSummary = data.paymentSummary as Record<string, unknown>;

  const totalAmount = Number(invoice.total_amount) || 0;
  const amountPaid = Number(paymentSummary?.amountPaid) || 0;
  const pendingAmount = Number(paymentSummary?.pendingAmount) || totalAmount;

  let statusLabel = 'UNPAID';
  let statusColor = '#ef4444';
  if (pendingAmount <= 0) {
    statusLabel = 'PAID';
    statusColor = '#22c55e';
  } else if (amountPaid > 0) {
    statusLabel = 'PARTIAL';
    statusColor = '#f59e0b';
  }

  const rows = items.map((item, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${String(item.product_name || item.product_id || '')}</td>
      <td style="text-align:right">${Number(item.qty).toLocaleString('en-IN')}</td>
      <td style="text-align:right">${formatCurrency(Number(item.rate))}</td>
      <td style="text-align:right">${item.gst_rate ? `${item.gst_rate}%` : '-'}</td>
      <td style="text-align:right">${formatCurrency(Number(item.amount))}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Invoice ${invoice.invoice_no}</title>
<style>
  body { font-family: 'JetBrains Mono', monospace; font-size: 11px; margin: 0; padding: 20mm; color: #1a1a1a; }
  .header { display: flex; justify-content: space-between; margin-bottom: 20px; border-bottom: 2px solid #1a1a1a; padding-bottom: 10px; }
  .company-name { font-size: 18px; font-weight: bold; }
  .invoice-title { font-size: 16px; font-weight: bold; text-align: right; }
  .invoice-no { font-size: 14px; color: #666; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
  .info-block h4 { margin: 0 0 5px; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th, td { border: 1px solid #333; padding: 6px 8px; text-align: left; }
  th { background: #f5f5f5; font-weight: bold; }
  .totals { text-align: right; margin-bottom: 20px; }
  .totals div { margin: 3px 0; }
  .totals .total { font-size: 14px; font-weight: bold; border-top: 2px solid #1a1a1a; padding-top: 5px; }
  .payment-summary { border: 1px solid #333; padding: 10px; margin-bottom: 20px; background: #fafafa; }
  .payment-summary h4 { margin: 0 0 8px; }
  .payment-summary .row { display: flex; justify-content: space-between; margin: 3px 0; }
  .payment-summary .pending { font-weight: bold; color: #ef4444; }
  .payment-summary .paid { color: #22c55e; }
  .status-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; color: white; font-size: 10px; font-weight: bold; background: ${statusColor}; }
  .footer { margin-top: 40px; display: flex; justify-content: space-between; }
  .signature { border-top: 1px solid #333; padding-top: 5px; width: 150px; text-align: center; }
  @media print { body { padding: 10mm; } }
</style></head>
<body>
  <div class="header">
    <div>
      <div class="company-name">${company?.name || ''}</div>
      <div>${company?.address || ''}</div>
      ${company?.gstin ? `<div>GSTIN: ${company.gstin}</div>` : ''}
      ${company?.phone ? `<div>Phone: ${company.phone}</div>` : ''}
    </div>
    <div>
      <div class="invoice-title">INVOICE</div>
      <div class="invoice-no">${invoice.invoice_no}</div>
      <div>Date: ${formatDate(String(invoice.invoice_date))}</div>
      <div>Status: <span class="status-badge">${statusLabel}</span></div>
    </div>
  </div>
  <div class="info-grid">
    <div class="info-block">
      <h4>Bill To</h4>
      <div>${customer?.name || ''}</div>
      <div>${customer?.address || ''}</div>
      ${customer?.gstin ? `<div>GSTIN: ${customer.gstin}</div>` : ''}
      ${customer?.phone ? `<div>Phone: ${customer.phone}</div>` : ''}
    </div>
    <div class="info-block">
      <h4>Invoice Details</h4>
      <div>Type: ${invoice.invoice_type || 'SALE'}</div>
      ${invoice.notes ? `<div>Notes: ${invoice.notes}</div>` : ''}
    </div>
  </div>
  <table>
    <thead><tr><th>#</th><th>Product</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">GST</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div>Subtotal: ${formatCurrency(Number(invoice.subtotal) || 0)}</div>
    ${Number(invoice.discount) > 0 ? `<div>Discount: ${formatCurrency(Number(invoice.discount))}</div>` : ''}
    ${Number(invoice.cgst_amount) > 0 ? `<div>CGST: ${formatCurrency(Number(invoice.cgst_amount))}</div>` : ''}
    ${Number(invoice.sgst_amount) > 0 ? `<div>SGST: ${formatCurrency(Number(invoice.sgst_amount))}</div>` : ''}
    ${Number(invoice.igst_amount) > 0 ? `<div>IGST: ${formatCurrency(Number(invoice.igst_amount))}</div>` : ''}
    <div class="total">Total: ${formatCurrency(totalAmount)}</div>
  </div>
  <div class="payment-summary">
    <h4>Payment Summary</h4>
    <div class="row"><span>Total Amount:</span><span>${formatCurrency(totalAmount)}</span></div>
    <div class="row"><span>Amount Paid:</span><span class="paid">${formatCurrency(amountPaid)}</span></div>
    <div class="row pending"><span>Pending Amount:</span><span>${formatCurrency(pendingAmount)}</span></div>
  </div>
  <div class="footer">
    <div>Notes: ${invoice.notes || 'Thank you for your business.'}</div>
    <div class="signature">Authorized Signature</div>
  </div>
</body></html>`;
}

export function renderReceiptTemplate(data: Record<string, unknown>): string {
  const receipt = data.receipt as Record<string, unknown>;
  const allocations = data.allocations as Record<string, unknown>[];
  const company = data.company as Record<string, unknown>;
  const customer = data.customer as Record<string, unknown>;

  const allocRows = allocations.map(a => `
    <tr>
      <td>${a.invoice_no}</td>
      <td style="text-align:right">${formatCurrency(Number(a.allocated_amount))}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Receipt ${receipt.receipt_no}</title>
<style>
  body { font-family: 'JetBrains Mono', monospace; font-size: 11px; margin: 0; padding: 20mm; color: #1a1a1a; }
  .header { display: flex; justify-content: space-between; margin-bottom: 20px; border-bottom: 2px solid #1a1a1a; padding-bottom: 10px; }
  .company-name { font-size: 18px; font-weight: bold; }
  .title { font-size: 16px; font-weight: bold; text-align: right; }
  table { width: 100%; border-collapse: collapse; margin: 15px 0; }
  th, td { border: 1px solid #333; padding: 6px 8px; }
  th { background: #f5f5f5; }
  .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
  .detail-row { display: flex; justify-content: space-between; margin: 5px 0; }
  .amount { font-size: 18px; font-weight: bold; margin: 10px 0; }
  .footer { margin-top: 40px; text-align: right; }
  .signature { border-top: 1px solid #333; padding-top: 5px; width: 150px; display: inline-block; text-align: center; }
  @media print { body { padding: 10mm; } }
</style></head>
<body>
  <div class="header">
    <div>
      <div class="company-name">${company?.name || ''}</div>
      <div>${company?.address || ''}</div>
      ${company?.phone ? `<div>Phone: ${company.phone}</div>` : ''}
    </div>
    <div>
      <div class="title">PAYMENT RECEIPT</div>
      <div>${receipt.receipt_no}</div>
      <div>Date: ${formatDate(String(receipt.receipt_date))}</div>
    </div>
  </div>
  <div class="detail-grid">
    <div>
      <h4>Received From</h4>
      <div>${customer?.name || ''}</div>
      ${customer?.address ? `<div>${customer.address}</div>` : ''}
      ${customer?.gstin ? `<div>GSTIN: ${customer.gstin}</div>` : ''}
    </div>
    <div>
      <h4>Payment Details</h4>
      <div class="detail-row"><span>Method:</span><span>${receipt.payment_method}</span></div>
      ${receipt.reference_no ? `<div class="detail-row"><span>Reference:</span><span>${receipt.reference_no}</span></div>` : ''}
      ${receipt.bank_account ? `<div class="detail-row"><span>Bank Account:</span><span>${receipt.bank_account}</span></div>` : ''}
    </div>
  </div>
  <div class="amount">Amount: ${formatCurrency(Number(receipt.amount))}</div>
  ${allocations.length > 0 ? `
    <h4>Allocation</h4>
    <table>
      <thead><tr><th>Invoice</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>${allocRows}</tbody>
    </table>
  ` : ''}
  ${receipt.narration ? `<div>Narration: ${receipt.narration}</div>` : ''}
  <div class="footer"><div class="signature">Authorized Signature</div></div>
</body></html>`;
}

export function renderCreditNoteTemplate(data: Record<string, unknown>): string {
  const cn = data.creditNote as Record<string, unknown>;
  const company = data.company as Record<string, unknown>;
  const customer = data.customer as Record<string, unknown>;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Credit Note ${cn.cn_no}</title>
<style>
  body { font-family: 'JetBrains Mono', monospace; font-size: 11px; margin: 0; padding: 20mm; color: #1a1a1a; }
  .header { display: flex; justify-content: space-between; margin-bottom: 20px; border-bottom: 2px solid #1a1a1a; padding-bottom: 10px; }
  .company-name { font-size: 18px; font-weight: bold; }
  .title { font-size: 16px; font-weight: bold; text-align: right; }
  .detail-row { display: flex; justify-content: space-between; margin: 5px 0; }
  .amount { font-size: 18px; font-weight: bold; margin: 15px 0; }
  .footer { margin-top: 40px; text-align: right; }
  .signature { border-top: 1px solid #333; padding-top: 5px; width: 150px; display: inline-block; text-align: center; }
  @media print { body { padding: 10mm; } }
</style></head>
<body>
  <div class="header">
    <div>
      <div class="company-name">${company?.name || ''}</div>
      <div>${company?.address || ''}</div>
      ${company?.gstin ? `<div>GSTIN: ${company.gstin}</div>` : ''}
    </div>
    <div>
      <div class="title">CREDIT NOTE</div>
      <div>${cn.cn_no}</div>
      <div>Date: ${formatDate(String(cn.cn_date))}</div>
      <div>Status: ${cn.status}</div>
    </div>
  </div>
  <div>
    <h4>Issued To</h4>
    <div>${customer?.name || ''}</div>
    ${customer?.address ? `<div>${customer.address}</div>` : ''}
    ${customer?.gstin ? `<div>GSTIN: ${customer.gstin}</div>` : ''}
  </div>
  ${cn.invoice_no ? `<div class="detail-row"><span>Against Invoice:</span><span>${cn.invoice_no}</span></div>` : ''}
  ${cn.reason ? `<div class="detail-row"><span>Reason:</span><span>${cn.reason}</span></div>` : ''}
  <div class="amount">Amount: ${formatCurrency(Number(cn.amount))}</div>
  ${cn.narration ? `<div>Narration: ${cn.narration}</div>` : ''}
  <div class="footer"><div class="signature">Authorized Signature</div></div>
</body></html>`;
}

export function renderLedgerTemplate(data: Record<string, unknown>): string {
  const entries = data.entries as Record<string, unknown>[];
  const company = data.company as Record<string, unknown>;
  const fy = data.financialYear as Record<string, unknown>;
  const customer = data.customer as Record<string, unknown>;
  const openingBalance = Number(data.openingBalance) || 0;
  const closingBalance = Number(data.closingBalance) || 0;
  const summary = data.summary as Record<string, unknown>;

  const rows = entries.map(e => `
    <tr>
      <td>${formatDate(String(e.entry_date))}</td>
      <td>${e.receipt_no || e.cn_no || e.invoice_no || '-'}</td>
      <td>${e.entry_type}</td>
      <td style="text-align:right">${e.debit ? formatCurrency(Number(e.debit)) : '-'}</td>
      <td style="text-align:right">${e.credit ? formatCurrency(Number(e.credit)) : '-'}</td>
      <td style="text-align:right">${formatCurrency(Number(e.balance) || 0)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Ledger</title>
<style>
  body { font-family: 'JetBrains Mono', monospace; font-size: 10px; margin: 0; padding: 15mm; color: #1a1a1a; }
  .header { display: flex; justify-content: space-between; margin-bottom: 15px; border-bottom: 2px solid #1a1a1a; padding-bottom: 10px; }
  .company-name { font-size: 16px; font-weight: bold; }
  .title { font-size: 14px; font-weight: bold; text-align: right; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  th, td { border: 1px solid #333; padding: 4px 6px; }
  th { background: #f5f5f5; }
  .footer-totals { margin-top: 15px; padding-top: 10px; border-top: 2px solid #1a1a1a; }
  .detail-row { display: flex; justify-content: space-between; margin: 3px 0; }
  @media print { body { padding: 10mm; } @page { size: A4 landscape; } }
</style></head>
<body>
  <div class="header">
    <div>
      <div class="company-name">${company?.name || ''}</div>
      <div>${company?.address || ''}</div>
    </div>
    <div>
      <div class="title">LEDGER</div>
      <div>${fy?.name || ''}</div>
      <div>${customer ? `Customer: ${customer.name}` : 'All Customers'}</div>
    </div>
  </div>
  <table>
    <thead><tr><th>Date</th><th>Ref No</th><th>Type</th><th style="text-align:right">Debit</th><th style="text-align:right">Credit</th><th style="text-align:right">Balance</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer-totals">
    <div class="detail-row"><span>Opening Balance:</span><span>${formatCurrency(openingBalance)}</span></div>
    <div class="detail-row"><span>Closing Balance:</span><span>${formatCurrency(closingBalance)}</span></div>
    ${summary ? `
      <div class="detail-row"><span>Total Debits:</span><span>${formatCurrency(Number(summary.totalDebit) || 0)}</span></div>
      <div class="detail-row"><span>Total Credits:</span><span>${formatCurrency(Number(summary.totalCredit) || 0)}</span></div>
    ` : ''}
  </div>
  <div style="margin-top:20px;font-size:9px;color:#666">Printed: ${new Date().toLocaleString('en-IN')}</div>
</body></html>`;
}

export async function generatePdf(html: string, options?: { pageSize?: 'A4' | 'Letter'; landscape?: boolean }): Promise<Buffer> {
  const win = new BrowserWindow({ show: false, width: 800, height: 600 });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  const pdf = await win.webContents.printToPDF({
    pageSize: options?.pageSize || 'A4',
    landscape: options?.landscape || false,
    margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' }
  });

  win.close();
  return pdf;
}

export function savePdf(pdf: Buffer, outputPath: string): string {
  const dir = join(outputPath, '..');
  mkdirSync(dir, { recursive: true });
  writeFileSync(outputPath, pdf);
  return outputPath;
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: All 3 targets build without errors.

---

### Task 7: IPC Handlers & Preload

**Files:**
- Modify: `src/main/ipc-handlers.ts`
- Modify: `src/main/preload.ts`

- [ ] **Step 1: Read `src/main/ipc-handlers.ts` to understand existing pattern**

- [ ] **Step 2: Add receipt, credit note, ledger, print, and settings handlers**

Append to `src/main/ipc-handlers.ts`:

```typescript
// Receipt handlers
import * as receipt from './receipt';
import * as creditNote from './credit-note';
import * as print from './print';
import * as ledger from './ledger';

// ... inside registerIpcHandlers() function, add:

// Receipts
ipcMain.handle(IPC_CHANNELS['receipt:list'], (_e, filters) => receipt.listReceipts(filters));
ipcMain.handle(IPC_CHANNELS['receipt:get'], (_e, id) => receipt.getReceipt(id));
ipcMain.handle(IPC_CHANNELS['receipt:create'], (_e, data) => receipt.createReceipt(data));
ipcMain.handle(IPC_CHANNELS['receipt:delete'], (_e, id) => receipt.deleteReceipt(id));
ipcMain.handle(IPC_CHANNELS['receipt:outstanding'], (_e, customerId) => receipt.getOutstandingInvoices(customerId));
ipcMain.handle(IPC_CHANNELS['receipt:generate-no'], (_e, date) => receipt.generateReceiptNo(date));

// Credit Notes
ipcMain.handle(IPC_CHANNELS['credit-note:list'], (_e, filters) => creditNote.listCreditNotes(filters));
ipcMain.handle(IPC_CHANNELS['credit-note:get'], (_e, id) => creditNote.getCreditNote(id));
ipcMain.handle(IPC_CHANNELS['credit-note:create'], (_e, data) => creditNote.createCreditNote(data));
ipcMain.handle(IPC_CHANNELS['credit-note:apply'], (_e, { cnId, invoiceId }) => creditNote.applyCreditNote(cnId, invoiceId));
ipcMain.handle(IPC_CHANNELS['credit-note:cancel'], (_e, cnId) => creditNote.cancelCreditNote(cnId));
ipcMain.handle(IPC_CHANNELS['credit-note:outstanding'], (_e, customerId) => creditNote.getActiveCreditNotes(customerId));
ipcMain.handle(IPC_CHANNELS['credit-note:generate-no'], (_e, date) => creditNote.generateCnNo(date));

// Ledger (extended)
ipcMain.handle(IPC_CHANNELS['ledger:customer'], (_e, { customerId, dateFrom, dateTo }) => ledger.getCustomerLedger(customerId, dateFrom, dateTo));
ipcMain.handle(IPC_CHANNELS['ledger:year'], (_e, { fyId, customerId, entryType }) => ledger.getYearLedger(fyId, customerId, entryType));
ipcMain.handle(IPC_CHANNELS['ledger:by-invoice'], (_e, invoiceId) => ledger.getInvoiceLedger(invoiceId));
ipcMain.handle(IPC_CHANNELS['ledger:summary'], (_e, fyId) => ledger.getLedgerSummary(fyId));

// Print
ipcMain.handle(IPC_CHANNELS['print:invoice'], (_e, data) => print.renderInvoiceTemplate(data));
ipcMain.handle(IPC_CHANNELS['print:receipt'], (_e, data) => print.renderReceiptTemplate(data));
ipcMain.handle(IPC_CHANNELS['print:credit-note'], (_e, data) => print.renderCreditNoteTemplate(data));
ipcMain.handle(IPC_CHANNELS['print:ledger'], (_e, data) => print.renderLedgerTemplate(data));
ipcMain.handle(IPC_CHANNELS['print:save-pdf'], async (_e, { html, outputPath }) => {
  const pdf = await print.generatePdf(html);
  print.savePdf(pdf, outputPath);
  return { success: true, path: outputPath };
});

// Settings
ipcMain.handle(IPC_CHANNELS['setting:get'], (_e, key) => {
  const result = queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return result?.value || null;
});
ipcMain.handle(IPC_CHANNELS['setting:set'], (_e, { key, value }) => {
  executeWrite('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
  return { success: true };
});
```

- [ ] **Step 3: Add preload APIs to `src/main/preload.ts`**

Add before the closing `});`:

```typescript
  // Receipts
  getReceipts: (filters?: unknown) => ipcRenderer.invoke(IPC_CHANNELS['receipt:list'], filters),
  getReceipt: (id: number) => ipcRenderer.invoke(IPC_CHANNELS['receipt:get'], id),
  createReceipt: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS['receipt:create'], data),
  deleteReceipt: (id: number) => ipcRenderer.invoke(IPC_CHANNELS['receipt:delete'], id),
  getOutstandingInvoices: (customerId: number) => ipcRenderer.invoke(IPC_CHANNELS['receipt:outstanding'], customerId),
  generateReceiptNo: (date: string) => ipcRenderer.invoke(IPC_CHANNELS['receipt:generate-no'], date),

  // Credit Notes
  getCreditNotes: (filters?: unknown) => ipcRenderer.invoke(IPC_CHANNELS['credit-note:list'], filters),
  getCreditNote: (id: number) => ipcRenderer.invoke(IPC_CHANNELS['credit-note:get'], id),
  createCreditNote: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS['credit-note:create'], data),
  applyCreditNote: (cnId: number, invoiceId: number) => ipcRenderer.invoke(IPC_CHANNELS['credit-note:apply'], { cnId, invoiceId }),
  cancelCreditNote: (id: number) => ipcRenderer.invoke(IPC_CHANNELS['credit-note:cancel'], id),
  getActiveCreditNotes: (customerId: number) => ipcRenderer.invoke(IPC_CHANNELS['credit-note:outstanding'], customerId),
  generateCnNo: (date: string) => ipcRenderer.invoke(IPC_CHANNELS['credit-note:generate-no'], date),

  // Ledger (extended)
  getCustomerLedger: (customerId: number, dateFrom?: string, dateTo?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['ledger:customer'], { customerId, dateFrom, dateTo }),
  getYearLedger: (fyId: number, customerId?: number, entryType?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['ledger:year'], { fyId, customerId, entryType }),
  getInvoiceLedger: (invoiceId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS['ledger:by-invoice'], invoiceId),
  getLedgerSummary: (fyId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS['ledger:summary'], fyId),

  // Print
  printInvoice: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS['print:invoice'], data),
  printReceipt: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS['print:receipt'], data),
  printCreditNote: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS['print:credit-note'], data),
  printLedger: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS['print:ledger'], data),
  savePdf: (html: string, outputPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['print:save-pdf'], { html, outputPath }),

  // Settings
  getSetting: (key: string) => ipcRenderer.invoke(IPC_CHANNELS['setting:get'], key),
  setSetting: (key: string, value: string) => ipcRenderer.invoke(IPC_CHANNELS['setting:set'], { key, value }),
```

- [ ] **Step 4: Verify build passes**

Run: `npm run build`
Expected: All 3 targets build without errors.

---

### Task 8: Receipts UI Components

**Files:**
- Create: `src/renderer/components/ReceiptsPanel.tsx`
- Create: `src/renderer/components/ReceiptModal.tsx`
- Create: `src/renderer/components/AllocationTable.tsx`
- Modify: `src/renderer/components/Dashboard.tsx`

- [ ] **Step 1: Create `src/renderer/components/AllocationTable.tsx`**

```tsx
import { useState, useEffect } from 'react';

interface Invoice {
  id: number;
  invoice_no: string;
  invoice_date: string;
  total_amount: number;
  total_remaining: number;
}

interface Allocation {
  invoice_id: number;
  allocated_amount: number;
}

interface Props {
  invoices: Invoice[];
  totalAmount: number;
  allocations: Allocation[];
  onChange: (allocations: Allocation[]) => void;
  mode: 'auto' | 'manual';
}

export default function AllocationTable({ invoices, totalAmount, allocations, onChange, mode }: Props) {
  const [localAllocations, setLocalAllocations] = useState<Allocation[]>(allocations);

  useEffect(() => {
    setLocalAllocations(allocations);
  }, [allocations]);

  function handleAutoAllocate() {
    const allocs: Allocation[] = [];
    let remaining = totalAmount;
    for (const inv of invoices) {
      if (remaining <= 0) break;
      const amount = Math.min(remaining, inv.total_remaining);
      allocs.push({ invoice_id: inv.id, allocated_amount: amount });
      remaining -= amount;
    }
    setLocalAllocations(allocs);
    onChange(allocs);
  }

  function handleAmountChange(invoiceId: number, value: string) {
    const num = parseFloat(value) || 0;
    const updated = localAllocations.map(a =>
      a.invoice_id === invoiceId ? { ...a, allocated_amount: Math.min(num, invoices.find(i => i.id === invoiceId)?.total_remaining || 0) } : a
    );
    setLocalAllocations(updated);
    onChange(updated);
  }

  const allocatedTotal = localAllocations.reduce((sum, a) => sum + a.allocated_amount, 0);

  return (
    <div className="allocation-table">
      <div className="allocation-header">
        <h4>Invoice Allocation</h4>
        {mode === 'auto' && (
          <button className="btn btn-sm" onClick={handleAutoAllocate}>Auto-allocate</button>
        )}
      </div>
      {invoices.length === 0 ? (
        <p className="muted">No outstanding invoices for this customer.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Date</th>
              <th>Remaining</th>
              {mode === 'manual' && <th>Allocated</th>}
            </tr>
          </thead>
          <tbody>
            {invoices.map(inv => {
              const alloc = localAllocations.find(a => a.invoice_id === inv.id);
              return (
                <tr key={inv.id}>
                  <td>{inv.invoice_no}</td>
                  <td>{inv.invoice_date}</td>
                  <td>₹{inv.total_remaining.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  {mode === 'manual' && (
                    <td>
                      <input
                        type="number"
                        className="input-sm"
                        value={alloc?.allocated_amount || ''}
                        onChange={e => handleAmountChange(inv.id, e.target.value)}
                        max={inv.total_remaining}
                        min={0}
                        step="0.01"
                      />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="allocation-footer">
        <span>Total Allocated: ₹{allocatedTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
        {allocatedTotal > totalAmount && (
          <span className="text-error">Exceeds payment amount!</span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/renderer/components/ReceiptModal.tsx`**

```tsx
import { useState, useEffect } from 'react';

interface Customer {
  id: number;
  name: string;
}

interface Invoice {
  id: number;
  invoice_no: string;
  invoice_date: string;
  total_amount: number;
  total_remaining: number;
}

interface Allocation {
  invoice_id: number;
  allocated_amount: number;
}

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
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (customerId) {
      loadInvoices(parseInt(customerId));
    } else {
      setInvoices([]);
      setAllocations([]);
    }
  }, [customerId]);

  async function loadInvoices(custId: number) {
    const invs = await window.electronAPI.getOutstandingInvoices(custId);
    setInvoices(invs || []);
  }

  function handleAutoAllocate() {
    const amt = parseFloat(amount) || 0;
    let remaining = amt;
    const allocs: Allocation[] = [];
    for (const inv of invoices) {
      if (remaining <= 0) break;
      const allocAmt = Math.min(remaining, inv.total_remaining);
      allocs.push({ invoice_id: inv.id, allocated_amount: allocAmt });
      remaining -= allocAmt;
    }
    setAllocations(allocs);
  }

  function handleAllocChange(newAllocs: Allocation[]) {
    setAllocations(newAllocs);
  }

  function handleAmountChange(value: string) {
    setAmount(value);
    if (allocMode === 'auto' && customerId) {
      setTimeout(() => handleAutoAllocate(), 100);
    }
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
        allocations: allocations.length > 0 ? allocations : [{ invoice_id: 0, allocated_amount: parseFloat(amount) }]
      };
      await onSave(data);
      resetForm();
      onClose();
    } catch (e) {
      console.error('Failed to create receipt:', e);
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setCustomerId('');
    setAmount('');
    setReceiptDate(new Date().toISOString().split('T')[0]);
    setPaymentMethod('CASH');
    setReferenceNo('');
    setBankAccount('');
    setNarration('');
    setAllocations([]);
    setInvoices([]);
  }

  if (!isOpen) return null;

  const allocatedTotal = allocations.reduce((sum, a) => sum + a.allocated_amount, 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>New Payment Receipt</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="form-group">
              <label>Customer *</label>
              <select value={customerId} onChange={e => setCustomerId(e.target.value)} className="input">
                <option value="">Select customer</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
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
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="CHEQUE">Cheque</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
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
                  <label>
                    <input type="radio" name="allocMode" value="auto" checked={allocMode === 'auto'} onChange={() => setAllocMode('auto')} />
                    Auto
                  </label>
                  <label>
                    <input type="radio" name="allocMode" value="manual" checked={allocMode === 'manual'} onChange={() => setAllocMode('manual')} />
                    Manual
                  </label>
                  {allocMode === 'auto' && (
                    <button className="btn btn-sm" onClick={handleAutoAllocate}>Re-allocate</button>
                  )}
                </div>
              </div>
              <table className="alloc-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Date</th>
                    <th>Remaining</th>
                    {allocMode === 'manual' && <th>Allocated</th>}
                    {allocMode === 'auto' && <th>Allocated</th>}
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => {
                    const alloc = allocations.find(a => a.invoice_id === inv.id);
                    return (
                      <tr key={inv.id}>
                        <td>{inv.invoice_no}</td>
                        <td>{inv.invoice_date}</td>
                        <td>₹{inv.total_remaining.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        {allocMode === 'manual' ? (
                          <td>
                            <input
                              type="number"
                              className="input-sm"
                              value={alloc?.allocated_amount || ''}
                              onChange={e => {
                                const num = parseFloat(e.target.value) || 0;
                                const updated = allocations.map(a =>
                                  a.invoice_id === inv.id ? { ...a, allocated_amount: Math.min(num, inv.total_remaining) } : a
                                );
                                if (!alloc) updated.push({ invoice_id: inv.id, allocated_amount: Math.min(num, inv.total_remaining) });
                                setAllocations(updated);
                              }}
                              max={inv.total_remaining}
                              min={0}
                              step="0.01"
                            />
                          </td>
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
                {allocatedTotal > parseFloat(amount || '0') && (
                  <span className="text-error">Exceeds payment amount!</span>
                )}
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
```

- [ ] **Step 3: Create `src/renderer/components/ReceiptsPanel.tsx`**

```tsx
import { useState, useEffect } from 'react';

interface Receipt {
  id: number;
  receipt_no: string;
  receipt_date: string;
  amount: number;
  payment_method: string;
  reference_no?: string;
  customer_name?: string;
  created_at?: string;
}

interface Customer {
  id: number;
  name: string;
}

interface Props {
  onChanged?: () => void;
}

export default function ReceiptsPanel({ onChanged }: Props) {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterMethod, setFilterMethod] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [recs, custs] = await Promise.all([
        window.electronAPI.getReceipts({}),
        window.electronAPI.getCustomers()
      ]);
      setReceipts(recs || []);
      setCustomers(custs || []);
    } catch (e) {
      console.error('Failed to load receipts:', e);
    } finally {
      setLoading(false);
    }
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
        <input
          type="text"
          className="input"
          placeholder="Filter by customer..."
          value={filterCustomer}
          onChange={e => setFilterCustomer(e.target.value)}
        />
        <select className="input" value={filterMethod} onChange={e => setFilterMethod(e.target.value)}>
          <option value="">All methods</option>
          <option value="CASH">Cash</option>
          <option value="UPI">UPI</option>
          <option value="CHEQUE">Cheque</option>
          <option value="BANK_TRANSFER">Bank Transfer</option>
          <option value="OTHER">Other</option>
        </select>
      </div>
      {loading ? (
        <p className="muted">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="muted">No receipts found.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Receipt No</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Reference</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id}>
                <td>{r.receipt_no}</td>
                <td>{r.receipt_date}</td>
                <td>{r.customer_name}</td>
                <td>₹{r.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td>{r.payment_method}</td>
                <td>{r.reference_no || '-'}</td>
                <td>
                  <button className="btn btn-sm" onClick={() => handleDelete(r.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ReceiptModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        customers={customers}
      />
    </div>
  );
}
```

- [ ] **Step 4: Update `src/renderer/components/Dashboard.tsx`**

Add imports:
```tsx
import ReceiptsPanel from './ReceiptsPanel';
```

Add to Tab type:
```tsx
type Tab = 'home' | 'import' | 'products' | 'customers' | 'invoices' | 'suppliers' | 'purchases' | 'receipts' | 'credit-notes' | 'ledger' | 'settings';
```

Add to nav array:
```tsx
{ id: 'receipts', label: 'Receipts' },
```

Add tab rendering:
```tsx
{tab === 'receipts' && <ReceiptsPanel onChanged={refresh} />}
```

- [ ] **Step 5: Verify build passes**

Run: `npm run build`
Expected: All 3 targets build without errors.

---

### Task 9: Credit Notes UI Components

**Files:**
- Create: `src/renderer/components/CreditNotesPanel.tsx`
- Create: `src/renderer/components/CreditNoteModal.tsx`
- Create: `src/renderer/components/ApplyCreditNoteModal.tsx`
- Modify: `src/renderer/components/Dashboard.tsx`

- [ ] **Step 1: Create `src/renderer/components/CreditNoteModal.tsx`**

```tsx
import { useState } from 'react';

interface Customer { id: number; name: string; }
interface Invoice { id: number; invoice_no: string; total_remaining: number; }

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: unknown) => void;
  customers: Customer[];
}

export default function CreditNoteModal({ isOpen, onClose, onSave, customers }: Props) {
  const [customerId, setCustomerId] = useState('');
  const [cnType, setCnType] = useState<'linked' | 'standalone'>('standalone');
  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [cnDate, setCnDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('');
  const [narration, setNarration] = useState('');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleCustomerChange(custId: string) {
    setCustomerId(custId);
    if (custId && cnType === 'linked') {
      const allInvoices = await window.electronAPI.getInvoices({});
      const custInvoices = (allInvoices || []).filter((i: any) => i.customer_id === parseInt(custId) && i.total_remaining > 0);
      setInvoices(custInvoices);
    } else {
      setInvoices([]);
    }
  }

  async function handleSubmit() {
    if (!customerId || !amount) return;
    setLoading(true);
    try {
      const data = {
        customer_id: parseInt(customerId),
        invoice_id: cnType === 'linked' && invoiceId ? parseInt(invoiceId) : undefined,
        cn_date: cnDate,
        amount: parseFloat(amount),
        reason: reason || undefined,
        narration: narration || undefined
      };
      await onSave(data);
      resetForm();
      onClose();
    } catch (e) {
      console.error('Failed to create credit note:', e);
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setCustomerId('');
    setCnType('standalone');
    setInvoiceId('');
    setAmount('');
    setCnDate(new Date().toISOString().split('T')[0]);
    setReason('');
    setNarration('');
    setInvoices([]);
  }

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>New Credit Note</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>Type</label>
            <div className="radio-group">
              <label><input type="radio" checked={cnType === 'standalone'} onChange={() => setCnType('standalone')} /> Standalone</label>
              <label><input type="radio" checked={cnType === 'linked'} onChange={() => setCnType('linked')} /> Linked to Invoice</label>
            </div>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label>Customer *</label>
              <select value={customerId} onChange={e => handleCustomerChange(e.target.value)} className="input">
                <option value="">Select customer</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            {cnType === 'linked' && (
              <div className="form-group">
                <label>Invoice</label>
                <select value={invoiceId} onChange={e => setInvoiceId(e.target.value)} className="input">
                  <option value="">Select invoice</option>
                  {invoices.map(i => <option key={i.id} value={i.id}>{i.invoice_no} (₹{i.total_remaining.toLocaleString('en-IN', { minimumFractionDigits: 2 })})</option>)}
                </select>
              </div>
            )}
            <div className="form-group">
              <label>Amount *</label>
              <input type="number" className="input" value={amount} onChange={e => setAmount(e.target.value)} step="0.01" min="0" />
            </div>
            <div className="form-group">
              <label>Date</label>
              <input type="date" className="input" value={cnDate} onChange={e => setCnDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Reason</label>
              <select value={reason} onChange={e => setReason(e.target.value)} className="input">
                <option value="">Select reason</option>
                <option value="Return">Return</option>
                <option value="Discount">Discount</option>
                <option value="Price Adjustment">Price Adjustment</option>
                <option value="Damaged Goods">Damaged Goods</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Narration</label>
            <textarea className="input" value={narration} onChange={e => setNarration(e.target.value)} rows={2} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={loading || !customerId || !amount}>
            {loading ? 'Saving...' : 'Save Credit Note'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/renderer/components/ApplyCreditNoteModal.tsx`**

```tsx
import { useState, useEffect } from 'react';

interface Invoice { id: number; invoice_no: string; total_remaining: number; }

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onApply: (cnId: number, invoiceId: number) => void;
  cnId: number;
  customerId: number;
}

export default function ApplyCreditNoteModal({ isOpen, onClose, onApply, cnId, customerId }: Props) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && customerId) {
      loadInvoices();
    }
  }, [isOpen, customerId]);

  async function loadInvoices() {
    const allInvoices = await window.electronAPI.getInvoices({});
    const custInvoices = (allInvoices || []).filter((i: any) => i.customer_id === customerId && i.total_remaining > 0);
    setInvoices(custInvoices);
  }

  async function handleApply() {
    if (!selectedInvoice) return;
    setLoading(true);
    try {
      await onApply(cnId, parseInt(selectedInvoice));
      onClose();
    } catch (e) {
      console.error('Failed to apply credit note:', e);
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Apply Credit Note</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>Select Invoice</label>
            <select value={selectedInvoice} onChange={e => setSelectedInvoice(e.target.value)} className="input">
              <option value="">Choose invoice...</option>
              {invoices.map(i => <option key={i.id} value={i.id}>{i.invoice_no} (₹{i.total_remaining.toLocaleString('en-IN', { minimumFractionDigits: 2 })})</option>)}
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleApply} disabled={loading || !selectedInvoice}>
            {loading ? 'Applying...' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/renderer/components/CreditNotesPanel.tsx`**

```tsx
import { useState, useEffect } from 'react';
import ApplyCreditNoteModal from './ApplyCreditNoteModal';

interface CreditNote {
  id: number;
  cn_no: string;
  cn_date: string;
  amount: number;
  reason?: string;
  status: string;
  customer_name?: string;
  invoice_no?: string;
  customer_id?: number;
}

interface Customer { id: number; name: string; }

interface Props { onChanged?: () => void; }

export default function CreditNotesPanel({ onChanged }: Props) {
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [applyModal, setApplyModal] = useState<{ open: boolean; cnId: number; customerId: number }>({ open: false, cnId: 0, customerId: 0 });
  const [filterStatus, setFilterStatus] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [cns, custs] = await Promise.all([
        window.electronAPI.getCreditNotes({}),
        window.electronAPI.getCustomers()
      ]);
      setCreditNotes(cns || []);
      setCustomers(custs || []);
    } catch (e) {
      console.error('Failed to load credit notes:', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(data: unknown) {
    await window.electronAPI.createCreditNote(data);
    await loadData();
    onChanged?.();
  }

  async function handleApply(cnId: number, invoiceId: number) {
    await window.electronAPI.applyCreditNote(cnId, invoiceId);
    await loadData();
    onChanged?.();
  }

  async function handleCancel(id: number) {
    if (!confirm('Cancel this credit note?')) return;
    await window.electronAPI.cancelCreditNote(id);
    await loadData();
    onChanged?.();
  }

  const filtered = filterStatus ? creditNotes.filter(cn => cn.status === filterStatus) : creditNotes;

  function statusBadge(status: string) {
    const cls = status === 'ACTIVE' ? 'badge-success' : status === 'APPLIED' ? 'badge-info' : 'badge-muted';
    return <span className={`badge ${cls}`}>{status}</span>;
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Credit Notes</h2>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)}>+ New Credit Note</button>
      </div>
      <div className="panel-filters">
        <select className="input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="APPLIED">Applied</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>
      {loading ? <p className="muted">Loading...</p> : filtered.length === 0 ? (
        <p className="muted">No credit notes found.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>CN No</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Invoice</th>
              <th>Amount</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(cn => (
              <tr key={cn.id}>
                <td>{cn.cn_no}</td>
                <td>{cn.cn_date}</td>
                <td>{cn.customer_name}</td>
                <td>{cn.invoice_no || '-'}</td>
                <td>₹{cn.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td>{cn.reason || '-'}</td>
                <td>{statusBadge(cn.status)}</td>
                <td>
                  {cn.status === 'ACTIVE' && (
                    <button className="btn btn-sm" onClick={() => setApplyModal({ open: true, cnId: cn.id, customerId: cn.customer_id || 0 })}>Apply</button>
                  )}
                  {cn.status !== 'CANCELLED' && (
                    <button className="btn btn-sm btn-danger" onClick={() => handleCancel(cn.id)}>Cancel</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <CreditNoteModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSave={handleSave} customers={customers} />
      <ApplyCreditNoteModal
        isOpen={applyModal.open}
        onClose={() => setApplyModal({ open: false, cnId: 0, customerId: 0 })}
        onApply={handleApply}
        cnId={applyModal.cnId}
        customerId={applyModal.customerId}
      />
    </div>
  );
}
```

- [ ] **Step 4: Update `src/renderer/components/Dashboard.tsx`**

Add imports:
```tsx
import CreditNotesPanel from './CreditNotesPanel';
```

Add to nav array:
```tsx
{ id: 'credit-notes', label: 'Credit Notes' },
```

Add tab rendering:
```tsx
{tab === 'credit-notes' && <CreditNotesPanel onChanged={refresh} />}
```

- [ ] **Step 5: Verify build passes**

Run: `npm run build`
Expected: All 3 targets build without errors.

---

### Task 10: Ledger UI Components

**Files:**
- Create: `src/renderer/components/LedgerPanel.tsx`
- Create: `src/renderer/components/LedgerFilters.tsx`
- Create: `src/renderer/components/LedgerTable.tsx`
- Create: `src/renderer/components/LedgerSummary.tsx`
- Create: `src/renderer/components/InvoiceDrillDown.tsx`
- Modify: `src/renderer/components/Dashboard.tsx`

- [ ] **Step 1: Create `src/renderer/components/LedgerFilters.tsx`**

```tsx
interface Customer { id: number; name: string; }
interface FinancialYear { id: number; name: string; }

interface Props {
  mode: 'customer' | 'year';
  onModeChange: (mode: 'customer' | 'year') => void;
  customers: Customer[];
  financialYears: FinancialYear[];
  selectedCustomer: string;
  onCustomerChange: (id: string) => void;
  selectedFy: string;
  onFyChange: (id: string) => void;
  dateFrom: string;
  onDateFromChange: (d: string) => void;
  dateTo: string;
  onDateToChange: (d: string) => void;
  entryType: string;
  onEntryTypeChange: (t: string) => void;
  onApply: () => void;
}

export default function LedgerFilters({
  mode, onModeChange, customers, financialYears,
  selectedCustomer, onCustomerChange, selectedFy, onFyChange,
  dateFrom, onDateFromChange, dateTo, onDateToChange,
  entryType, onEntryTypeChange, onApply
}: Props) {
  return (
    <div className="ledger-filters">
      <div className="filter-mode">
        <button className={`btn btn-sm ${mode === 'customer' ? 'btn-primary' : ''}`} onClick={() => onModeChange('customer')}>Customer Ledger</button>
        <button className={`btn btn-sm ${mode === 'year' ? 'btn-primary' : ''}`} onClick={() => onModeChange('year')}>Year Ledger</button>
      </div>
      <div className="filter-fields">
        {mode === 'customer' ? (
          <select className="input" value={selectedCustomer} onChange={e => onCustomerChange(e.target.value)}>
            <option value="">Select customer</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        ) : (
          <select className="input" value={selectedFy} onChange={e => onFyChange(e.target.value)}>
            <option value="">Select FY</option>
            {financialYears.map(fy => <option key={fy.id} value={fy.id}>{fy.name}</option>)}
          </select>
        )}
        <input type="date" className="input" value={dateFrom} onChange={e => onDateFromChange(e.target.value)} placeholder="From" />
        <input type="date" className="input" value={dateTo} onChange={e => onDateToChange(e.target.value)} placeholder="To" />
        <select className="input" value={entryType} onChange={e => onEntryTypeChange(e.target.value)}>
          <option value="">All types</option>
          <option value="INVOICE">Invoice</option>
          <option value="RETURN">Return</option>
          <option value="RECEIPT">Receipt</option>
          <option value="PAYMENT">Payment</option>
          <option value="CREDIT_NOTE">Credit Note</option>
          <option value="CREDIT_APPLIED">Credit Applied</option>
        </select>
        <button className="btn btn-primary" onClick={onApply}>Apply</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/renderer/components/InvoiceDrillDown.tsx`**

```tsx
interface InvoiceItem {
  id: number;
  product_name?: string;
  qty: number;
  rate: number;
  amount: number;
  gst_rate?: number;
  gst_amount?: number;
}

interface Props {
  items: InvoiceItem[];
}

export default function InvoiceDrillDown({ items }: Props) {
  return (
    <div className="invoice-drilldown">
      <table className="drilldown-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Product</th>
            <th>Qty</th>
            <th>Rate</th>
            <th>GST</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={item.id}>
              <td>{i + 1}</td>
              <td>{item.product_name || '-'}</td>
              <td>{item.qty}</td>
              <td>₹{item.rate.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              <td>{item.gst_rate ? `${item.gst_rate}%` : '-'}</td>
              <td>₹{item.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/renderer/components/LedgerTable.tsx`**

```tsx
import { useState } from 'react';
import InvoiceDrillDown from './InvoiceDrillDown';

interface LedgerEntry {
  id: number;
  entry_date: string;
  entry_type: string;
  debit?: number;
  credit?: number;
  balance?: number;
  customer_name?: string;
  invoice_no?: string;
  receipt_no?: string;
  cn_no?: string;
  narration?: string;
  invoice_id?: number;
}

interface InvoiceItem {
  id: number;
  product_name?: string;
  qty: number;
  rate: number;
  amount: number;
  gst_rate?: number;
  gst_amount?: number;
}

interface Props {
  entries: LedgerEntry[];
  mode: 'customer' | 'year';
  onGetItems: (invoiceId: number) => Promise<InvoiceItem[]>;
}

export default function LedgerTable({ entries, mode, onGetItems }: Props) {
  const [expandedInvoice, setExpandedInvoice] = useState<number | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  async function toggleInvoice(invoiceId: number) {
    if (expandedInvoice === invoiceId) {
      setExpandedInvoice(null);
      setItems([]);
      return;
    }
    setLoadingItems(true);
    try {
      const invoiceItems = await onGetItems(invoiceId);
      setExpandedInvoice(invoiceId);
      setItems(invoiceItems || []);
    } catch (e) {
      console.error('Failed to load invoice items:', e);
    } finally {
      setLoadingItems(false);
    }
  }

  function typeBadge(type: string) {
    const colors: Record<string, string> = {
      INVOICE: 'badge-info', RETURN: 'badge-warning', RECEIPT: 'badge-success',
      PAYMENT: 'badge-success', CREDIT_NOTE: 'badge-purple', CREDIT_APPLIED: 'badge-teal',
      CN_CANCELLED: 'badge-muted', PURCHASE: 'badge-info', PURCHASE_PAYMENT: 'badge-success'
    };
    return <span className={`badge ${colors[type] || 'badge-muted'}`}>{type}</span>;
  }

  function formatBalance(val?: number) {
    if (val === undefined) return '-';
    if (val < 0) return `(₹${Math.abs(val).toLocaleString('en-IN', { minimumFractionDigits: 2 })})`;
    return `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  }

  return (
    <div className="ledger-table">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Ref No</th>
            {mode === 'year' && <th>Customer</th>}
            <th>Type</th>
            <th style={{ textAlign: 'right' }}>Debit</th>
            <th style={{ textAlign: 'right' }}>Credit</th>
            <th style={{ textAlign: 'right' }}>Balance</th>
            <th>Narration</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(entry => (
            <>
              <tr key={entry.id}>
                <td>{entry.entry_date}</td>
                <td>
                  {entry.invoice_no && entry.entry_type === 'INVOICE' ? (
                    <button className="link-btn" onClick={() => toggleInvoice(entry.invoice_id!)}>{entry.invoice_no}</button>
                  ) : entry.receipt_no || entry.cn_no || entry.invoice_no || '-'}
                </td>
                {mode === 'year' && <td>{entry.customer_name}</td>}
                <td>{typeBadge(entry.entry_type)}</td>
                <td style={{ textAlign: 'right' }}>{entry.debit ? `₹${entry.debit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}</td>
                <td style={{ textAlign: 'right' }}>{entry.credit ? `₹${entry.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}</td>
                <td style={{ textAlign: 'right' }}>{formatBalance(entry.balance)}</td>
                <td className="narration-cell">{entry.narration}</td>
              </tr>
              {expandedInvoice === entry.invoice_id && loadingItems && (
                <tr><td colSpan={8} className="muted">Loading items...</td></tr>
              )}
              {expandedInvoice === entry.invoice_id && !loadingItems && (
                <tr><td colSpan={8}><InvoiceDrillDown items={items} /></td></tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Create `src/renderer/components/LedgerSummary.tsx`**

```tsx
interface Props {
  openingBalance?: number;
  closingBalance?: number;
  totalDebit?: number;
  totalCredit?: number;
  netBalance?: number;
  mode: 'customer' | 'year';
}

export default function LedgerSummary({ openingBalance, closingBalance, totalDebit, totalCredit, netBalance, mode }: Props) {
  function fmt(val?: number) {
    if (val === undefined) return '-';
    if (val < 0) return `(₹${Math.abs(val).toLocaleString('en-IN', { minimumFractionDigits: 2 })})`;
    return `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  }

  return (
    <div className="ledger-summary">
      {mode === 'customer' && (
        <>
          <div className="summary-row"><span>Opening Balance:</span><span>{fmt(openingBalance)}</span></div>
          <div className="summary-row"><span>Closing Balance:</span><span>{fmt(closingBalance)}</span></div>
        </>
      )}
      {mode === 'year' && (
        <>
          <div className="summary-row"><span>Total Debits:</span><span>{fmt(totalDebit)}</span></div>
          <div className="summary-row"><span>Total Credits:</span><span>{fmt(totalCredit)}</span></div>
          <div className="summary-row"><span>Net Balance:</span><span>{fmt(netBalance)}</span></div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create `src/renderer/components/LedgerPanel.tsx`**

```tsx
import { useState, useEffect } from 'react';
import LedgerFilters from './LedgerFilters';
import LedgerTable from './LedgerTable';
import LedgerSummary from './LedgerSummary';

interface Customer { id: number; name: string; }
interface FinancialYear { id: number; name: string; start_date: string; end_date: string; }
interface LedgerEntry {
  id: number; entry_date: string; entry_type: string; debit?: number; credit?: number;
  balance?: number; customer_name?: string; invoice_no?: string; receipt_no?: string;
  cn_no?: string; narration?: string; invoice_id?: number;
}
interface InvoiceItem {
  id: number; product_name?: string; qty: number; rate: number; amount: number;
  gst_rate?: number; gst_amount?: number;
}

interface Props { onChanged?: () => void; }

export default function LedgerPanel({ onChanged }: Props) {
  const [mode, setMode] = useState<'customer' | 'year'>('customer');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedFy, setSelectedFy] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [entryType, setEntryType] = useState('');
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [closingBalance, setClosingBalance] = useState(0);
  const [summary, setSummary] = useState<{ totalDebit: number; totalCredit: number; netBalance: number } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      window.electronAPI.getCustomers(),
      window.electronAPI.getFinancialYears(window.electronAPI.getCompanies?.().then((cs: any[]) => cs?.[0]?.id) || 1)
    ]).then(([custs, fys]) => {
      setCustomers(custs || []);
      setFinancialYears(fys || []);
    });
  }, []);

  async function loadLedger() {
    setLoading(true);
    try {
      if (mode === 'customer' && selectedCustomer) {
        const result = await window.electronAPI.getCustomerLedger(parseInt(selectedCustomer), dateFrom || undefined, dateTo || undefined);
        setEntries(result?.entries || []);
        setOpeningBalance(result?.openingBalance || 0);
        setClosingBalance(result?.closingBalance || 0);
        setSummary(null);
      } else if (mode === 'year' && selectedFy) {
        const result = await window.electronAPI.getYearLedger(parseInt(selectedFy), selectedCustomer ? parseInt(selectedCustomer) : undefined, entryType || undefined);
        setEntries(result?.entries || []);
        setSummary(result?.summary || null);
        setOpeningBalance(0);
        setClosingBalance(0);
      }
    } catch (e) {
      console.error('Failed to load ledger:', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleGetItems(invoiceId: number): Promise<InvoiceItem[]> {
    return await window.electronAPI.getInvoiceItems(invoiceId);
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Ledger</h2>
      </div>
      <LedgerFilters
        mode={mode}
        onModeChange={setMode}
        customers={customers}
        financialYears={financialYears}
        selectedCustomer={selectedCustomer}
        onCustomerChange={setSelectedCustomer}
        selectedFy={selectedFy}
        onFyChange={setSelectedFy}
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        dateTo={dateTo}
        onDateToChange={setDateTo}
        entryType={entryType}
        onEntryTypeChange={setEntryType}
        onApply={loadLedger}
      />
      {loading ? <p className="muted">Loading...</p> : entries.length === 0 ? (
        <p className="muted">No ledger entries found. Select a customer or FY and click Apply.</p>
      ) : (
        <>
          <LedgerTable entries={entries} mode={mode} onGetItems={handleGetItems} />
          <LedgerSummary
            openingBalance={openingBalance}
            closingBalance={closingBalance}
            totalDebit={summary?.totalDebit}
            totalCredit={summary?.totalCredit}
            netBalance={summary?.netBalance}
            mode={mode}
          />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Update `src/renderer/components/Dashboard.tsx`**

Add imports:
```tsx
import LedgerPanel from './LedgerPanel';
```

Add to nav array:
```tsx
{ id: 'ledger', label: 'Ledger' },
```

Add tab rendering:
```tsx
{tab === 'ledger' && <LedgerPanel onChanged={refresh} />}
```

- [ ] **Step 7: Verify build passes**

Run: `npm run build`
Expected: All 3 targets build without errors.

---

### Task 11: Print System UI

**Files:**
- Create: `src/renderer/components/PrintPreviewModal.tsx`
- Modify: `src/renderer/components/InvoicesPanel.tsx` (add print button)
- Modify: `src/renderer/styles/global.css` (add print CSS)

- [ ] **Step 1: Create `src/renderer/components/PrintPreviewModal.tsx`**

```tsx
import { useState } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  html: string;
  title: string;
}

export default function PrintPreviewModal({ isOpen, onClose, html, title }: Props) {
  const [saving, setSaving] = useState(false);
  const [savedPath, setSavedPath] = useState('');

  if (!isOpen) return null;

  function handlePrint() {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.print();
    }
  }

  async function handleSavePdf() {
    setSaving(true);
    try {
      const result = await window.electronAPI.savePdf(html, `data/prints/${title.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.pdf`);
      setSavedPath(result.path);
    } catch (e) {
      console.error('Failed to save PDF:', e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Print Preview: {title}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <iframe
            srcDoc={html}
            className="print-preview-frame"
            title="Print preview"
            style={{ width: '100%', height: '600px', border: '1px solid var(--hairline)' }}
          />
        </div>
        <div className="modal-footer">
          {savedPath && <span className="muted">Saved: {savedPath}</span>}
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn" onClick={handleSavePdf} disabled={saving}>
            {saving ? 'Saving...' : 'Save PDF'}
          </button>
          <button className="btn btn-primary" onClick={handlePrint}>Print</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add print CSS to `src/renderer/styles/global.css`**

Append to the end of the file:

```css
/* Print styles */
@media print {
  body { background: white; color: black; }
  .no-print { display: none !important; }
  .sidebar, .theme-toggle, .nav-btn, .btn, .modal-overlay { display: none !important; }
  .main { margin: 0; padding: 0; }
  .app-shell { display: block; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #000; padding: 6px 8px; }
  @page { size: A4 portrait; margin: 10mm; }
  @page :first { margin-top: 0; }
}

.print-preview-frame {
  background: white;
}

.ledger-filters {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1rem;
  padding: 0.75rem;
  border: 1px solid var(--hairline);
}

.filter-mode {
  display: flex;
  gap: 0.5rem;
}

.filter-fields {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.ledger-summary {
  margin-top: 1rem;
  padding: 0.75rem;
  border: 1px solid var(--hairline);
}

.summary-row {
  display: flex;
  justify-content: space-between;
  padding: 0.25rem 0;
}

.link-btn {
  background: none;
  border: none;
  color: var(--ink);
  text-decoration: underline;
  cursor: pointer;
  padding: 0;
  font: inherit;
}

.link-btn:hover {
  color: var(--accent);
}

.narration-cell {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drilldown-table {
  margin: 0.5rem 0;
  font-size: 0.85rem;
}

.invoice-drilldown {
  padding: 0.5rem 1rem;
  background: var(--canvas);
}

.allocation-section {
  margin-top: 1rem;
  padding: 0.75rem;
  border: 1px solid var(--hairline);
}

.allocation-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.alloc-controls {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.alloc-table {
  width: 100%;
  margin-bottom: 0.5rem;
}

.alloc-footer {
  display: flex;
  justify-content: space-between;
  padding-top: 0.5rem;
  border-top: 1px solid var(--hairline);
}

.text-error {
  color: #ef4444;
}

.badge-purple {
  background: #7c3aed;
  color: white;
}

.badge-teal {
  background: #14b8a6;
  color: white;
}

.radio-group {
  display: flex;
  gap: 1rem;
}

.panel-filters {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.input-sm {
  width: 80px;
  padding: 0.25rem 0.5rem;
  font-size: 0.85rem;
}

.modal-lg {
  max-width: 900px;
}

.modal-sm {
  max-width: 400px;
}
```

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: All 3 targets build without errors.

---

### Task 12: Final Integration & Testing

**Files:**
- All modified/created files

- [ ] **Step 1: Full build verification**

Run: `npm run build`
Expected: All 3 targets (main, preload, renderer) build without errors.

- [ ] **Step 2: Verify all IPC channels are registered**

Check `src/main/ipc-handlers.ts` has all new handlers and `src/main/preload.ts` exposes all new APIs.

- [ ] **Step 3: Verify Dashboard tabs**

Check `src/renderer/components/Dashboard.tsx` has all new tabs:
- `receipts` → ReceiptsPanel
- `credit-notes` → CreditNotesPanel
- `ledger` → LedgerPanel

- [ ] **Step 4: Verify CSS includes all new styles**

Check `src/renderer/styles/global.css` has print styles and component styles.

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "feat: add payment receipts, credit notes, ledger views, and print system

- New tables: receipts, receipt_allocations, credit_notes
- Extended ledger_entries with receipt_id, cn_id columns
- New entry types: RECEIPT, CREDIT_NOTE, CREDIT_APPLIED, CN_CANCELLED
- Receipt creation with auto/manual invoice allocation
- Credit notes (linked and standalone) with apply/cancel workflow
- Customer and year ledger views with running balance
- Print/PDF system for invoices, receipts, credit notes, and ledger
- Payment summary on invoice print showing pending amount"
```
