# Payment Receipts, Credit Notes, Ledger & Print System — Design Spec

**Date:** 2026-05-19
**Status:** Draft — Pending Review
**Approach:** Incremental (New Tables + Extended Ledger)

---

## Overview

Add four interconnected features to LedgerMitra:
1. **Payment Receipts** — Record customer payments with auto/manual invoice allocation
2. **Credit Notes** — Issue linked or standalone credit notes with application workflow
3. **Ledger View** — Customer-wise and year-wise ledger with running balance
4. **Print System** — Print/PDF for invoices, receipts, credit notes, and ledger

All features work with both native and legacy-imported data.

---

## 1. Data Model

### New Tables

#### `receipts`
```sql
CREATE TABLE receipts (
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
);
```

#### `receipt_allocations`
```sql
CREATE TABLE receipt_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id INTEGER NOT NULL REFERENCES receipts(id),
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  allocated_amount DECIMAL(15,2) NOT NULL,
  UNIQUE(receipt_id, invoice_id)
);
```

#### `credit_notes`
```sql
CREATE TABLE credit_notes (
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
);
```

### Schema Extensions

**`ledger_entries` — new columns:**
```sql
ALTER TABLE ledger_entries ADD COLUMN receipt_id INTEGER REFERENCES receipts(id);
ALTER TABLE ledger_entries ADD COLUMN cn_id INTEGER REFERENCES credit_notes(id);
```

**`ledger_entries` — new `entry_type` values:**
`RECEIPT`, `CREDIT_NOTE`, `CREDIT_APPLIED`, `CN_CANCELLED`

**`settings` — new keys:**
- `receipt_prefix` (default: `REC`)
- `cn_prefix` (default: `CN`)
- `receipt_sequence_{YYYYMMDD}` (daily counter)
- `cn_sequence_{YYYYMMDD}` (daily counter)

### Type Definitions (`@shared/types.ts`)

```typescript
interface Receipt {
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

interface ReceiptAllocation {
  id: number;
  receipt_id: number;
  invoice_id: number;
  allocated_amount: number;
  invoice_no?: string;
  invoice_date?: string;
  invoice_total?: number;
}

interface CreditNote {
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

interface LedgerEntry {
  id: number;
  entry_date: string;
  customer_id?: number;
  invoice_id?: number;
  receipt_id?: number;
  cn_id?: number;
  entry_type: 'INVOICE' | 'RETURN' | 'PAYMENT' | 'RECEIPT' | 'CREDIT_NOTE' | 'CREDIT_APPLIED' | 'CN_CANCELLED' | 'PURCHASE' | 'PURCHASE_PAYMENT';
  debit?: number;
  credit?: number;
  balance?: number;
  narration?: string;
  customer_name?: string;
  invoice_no?: string;
  receipt_no?: string;
  cn_no?: string;
}
```

---

## 2. Payment Receipt System

### Receipt Creation Flow
1. User opens "New Receipt" modal
2. Selects customer → shows outstanding invoices
3. Enters amount, date, payment method, reference no., bank account, narration
4. Chooses allocation mode:
   - **Auto-apply** — oldest invoices first until amount exhausted
   - **Manual** — user specifies amounts per invoice
5. On save (transactional):
   - Create `receipts` row with receipt number
   - Create `receipt_allocations` rows
   - Update each invoice's `total_remaining`
   - Update customer `current_balance`
   - Create ledger entry of type `RECEIPT`

### Receipt Number Format
`REC-20260519-001` — `{PREFIX}-{YYYYMMDD}-{SEQ}`
- Prefix from `settings.receipt_prefix`
- Sequence resets daily

### IPC Channels
```
receipt:list          → Receipt[]
receipt:get           → Receipt + allocations
receipt:create        → { receipt, allocations, ledgerEntry }
receipt:delete        → reverses all effects
receipt:outstanding   → outstanding invoices for customer
```

### Main Process (`src/main/receipt.ts`)
- `listReceipts(filters)`
- `createReceipt(data)` — transactional
- `deleteReceipt(id)` — reverses allocations, ledger, balance
- `generateReceiptNo(date)` — atomic sequence
- `autoAllocate(customerId, amount)` — oldest-first allocation

### UI Components
- `ReceiptsPanel` — list with filters
- `ReceiptModal` — create/edit form
- `AllocationTable` — editable invoice allocations
- `ReceiptPrintView` — print template

### Error Handling
- Amount exceeds outstanding → warning (allows advance payment)
- Duplicate receipt number → retry next sequence
- Transaction rollback on any failure

---

## 3. Credit Notes System

### Credit Note Creation Flow
1. User opens "New Credit Note" modal
2. Chooses type:
   - **Linked** — select existing invoice
   - **Standalone** — no invoice reference
3. Enters amount, date, reason, narration
4. On save (transactional):
   - Create `credit_notes` row with CN number
   - If linked: reduce invoice `total_remaining`, status = `APPLIED`
   - If standalone: status = `ACTIVE`
   - Update customer `current_balance`
   - Create ledger entry of type `CREDIT_NOTE`

### Apply Credit Note (Standalone)
1. Select `ACTIVE` CN → "Apply to Invoice"
2. Select target invoice
3. On apply (transactional):
   - Create ledger entry of type `CREDIT_APPLIED`
   - Reduce invoice `total_remaining`
   - Update CN status to `APPLIED`

### Cancel Credit Note
1. Select CN → "Cancel"
2. If `APPLIED`: reverse allocation, restore invoice balance
3. Create ledger entry of type `CN_CANCELLED`
4. Update CN status to `CANCELLED`
5. Restore customer `current_balance`

### CN Number Format
`CN-20260519-001` — `{PREFIX}-{YYYYMMDD}-{SEQ}`

### IPC Channels
```
credit-note:list         → CreditNote[]
credit-note:get          → CreditNote detail
credit-note:create       → { creditNote, ledgerEntry }
credit-note:apply        → { ledgerEntry, updatedInvoice }
credit-note:cancel       → { reversalEntry, updatedInvoice, updatedCN }
credit-note:outstanding  → available active CNs for customer
```

### Main Process (`src/main/credit-note.ts`)
- `listCreditNotes(filters)`
- `createCreditNote(data)` — transactional
- `applyCreditNote(cnId, invoiceId)` — transactional
- `cancelCreditNote(cnId)` — transactional
- `generateCnNo(date)` — atomic sequence

### UI Components
- `CreditNotesPanel` — list with filters
- `CreditNoteModal` — create form (linked/standalone toggle)
- `ApplyCreditNoteModal` — select target invoice
- `CreditNotePrintView` — print template

### Error Handling
- CN amount exceeds invoice total → block
- Cannot apply to fully-paid invoice
- Cannot cancel already-cancelled CN
- Transaction rollback on any failure

---

## 4. Ledger View System

### Two View Modes

**Customer Ledger View:**
- Select customer → all entries with running balance
- Filterable by date range, entry type
- Grouped by FY if spanning multiple years

**Year Ledger View:**
- Select FY → all entries across all customers
- Running balance per customer (resets at boundary)
- Filterable by customer, entry type, invoice number
- Summary footer: total debits, credits, net balance

### Ledger Entry Display
| Date | Ref No | Type | Customer | Invoice | Debit | Credit | Balance | Narration |

- Ref No links to source document
- Type: color-coded badges
- Balance: running total, negative in parentheses
- Invoice entries expandable to show line items

### Running Balance
- Computed sequentially: `balance = previous + debit - credit`
- Starts from customer `opening_balance` (Dr/Cr adjusted)
- Year view: resets at each customer boundary

### Filters
- Date range (from/to)
- Entry type (multi-select)
- Customer (searchable dropdown)
- Invoice/receipt/CN number (text search)
- Amount range (min/max)

### IPC Channels
```
ledger:customer      → { entries, openingBalance, closingBalance }
ledger:year          → { entries, summary }
ledger:by-invoice    → { entries, invoice, items }
ledger:summary       → per-customer balance summary
```

### Main Process (`src/main/ledger.ts` — extended)
- `getCustomerLedger(customerId, dateFrom?, dateTo?)`
- `getYearLedger(fyId, customerId?, entryType?)`
- `getInvoiceLedger(invoiceId)`
- `computeRunningBalance(entries, openingBalance)`
- `getLedgerSummary(fyId)`

### UI Components
- `LedgerPanel` — main view with mode toggle
- `LedgerFilters` — filter bar
- `LedgerTable` — entry table with drill-down
- `LedgerSummary` — totals and balance cards
- `InvoiceDrillDown` — expandable line items

### Legacy Import Compatibility
- Imported entries work out of the box
- Opening balances from import used as starting point
- No migration needed

---

## 5. Print System

### Architecture
- **Browser Print** — `window.print()` with `@media print` CSS
- **Electron PDF** — `webContents.printToPDF()` for archival

### Print Templates

**Invoice Print:**
- Company header, invoice details, customer info
- Line items table
- Totals (subtotal, discount, CGST, SGST, IGST, total)
- **Payment Summary section:**
  - Total Amount
  - Amount Paid
  - Pending Amount
- Status badge: PAID (green), PARTIAL (orange), UNPAID (red)
- Notes, authorized signature

**Receipt Print:**
- Company header, receipt details
- Received from, amount, payment method, reference, bank account
- Allocation breakdown
- Narration, authorized signature

**Credit Note Print:**
- Company header, CN details
- Issued to, against invoice (if linked)
- Amount, reason, narration
- Authorized signature

**Ledger Print:**
- Company header, FY, customer (or "All Customers")
- Entry table with running balance
- Opening/closing balance
- Printed date, page numbers
- Landscape orientation for wide tables

### Print CSS
```css
@media print {
  body { background: white; color: black; }
  .no-print { display: none !important; }
  .print-only { display: block !important; }
  .print-container { max-width: 210mm; margin: 0 auto; padding: 20mm; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #000; padding: 6px 8px; }
  @page { size: A4 portrait; margin: 10mm; }
}
```

### IPC Channels
```
print:invoice      → render invoice template
print:receipt      → render receipt template
print:credit-note  → render CN template
print:ledger       → render ledger template
print:save-pdf     → { html, outputPath } → { success, path }
```

### Main Process (`src/main/print.ts`)
- `renderPrintTemplate(type, data)` — HTML string
- `generatePdf(html, options)` — `printToPDF()`
- `savePdf(html, outputPath)` — save to disk
- `getPrintSettings()` — company info, logo, preferences

### UI Components
- `PrintPreviewModal` — preview with Print/Save PDF buttons
- `PrintToolbar` — print button on document views
- `PrintSettings` — logo upload, header/footer text, paper size

### Error Handling
- Logo missing → text header fallback
- PDF save fails → error toast with retry
- Print cancelled → modal closes
- Template render error → plain text fallback

---

## 6. Dashboard Sidebar Updates

New tabs added to dashboard navigation:
- `receipts` — ReceiptsPanel + ReceiptModal
- `credit-notes` — CreditNotesPanel + CreditNoteModal
- `ledger` — LedgerPanel

Existing tabs with print integration:
- `invoices` — Add Print button to invoice list/detail

---

## 7. File Structure

```
src/
  shared/
    types.ts                    # New interfaces
    constants.ts                # New IPC channels
  main/
    receipt.ts                  # Receipt CRUD + allocation
    credit-note.ts              # Credit note CRUD + apply/cancel
    print.ts                    # Print template rendering + PDF
    ledger.ts                   # Extended ledger queries
    database.ts                 # Migration for new tables/columns
  renderer/
    components/
      ReceiptsPanel.tsx         # Receipt list view
      ReceiptModal.tsx          # Receipt create/edit
      AllocationTable.tsx       # Invoice allocation editor
      ReceiptPrintView.tsx      # Receipt print template
      CreditNotesPanel.tsx      # CN list view
      CreditNoteModal.tsx       # CN create/edit
      ApplyCreditNoteModal.tsx  # Apply standalone CN
      CreditNotePrintView.tsx   # CN print template
      LedgerPanel.tsx           # Ledger view (customer/year)
      LedgerFilters.tsx         # Filter controls
      LedgerTable.tsx           # Entry table
      LedgerSummary.tsx         # Totals and balance cards
      InvoiceDrillDown.tsx      # Expandable line items
      PrintPreviewModal.tsx     # Print preview + actions
      PrintSettings.tsx         # Print configuration
    styles/
      global.css                # Print CSS, new component styles
```

---

## 8. Migration Strategy

1. Add new tables via `ALTER TABLE` / `CREATE TABLE IF NOT EXISTS` in `initializeDatabase()`
2. Add new columns to `ledger_entries` if not present
3. Initialize default settings for receipt/CN prefixes
4. No data migration needed — existing entries work with new ledger queries
5. Legacy import data compatible out of the box

---

## 9. Testing Strategy

- Unit tests for receipt number generation, auto-allocation, balance computation
- Integration tests for receipt/create (transaction rollback on failure)
- Integration tests for credit note apply/cancel workflows
- Ledger running balance accuracy tests (including legacy data)
- Print template rendering tests (HTML output validation)
- Manual testing: full workflows for receipt, CN, ledger, print
