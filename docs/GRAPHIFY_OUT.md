# LedgerMitra — Project Context (graphify-out)

**Last updated:** 2026-06-27 (session 2)

---

## Current State

LedgerMitra is a desktop accounting app (Electron + React + SQLite) targeting Indian small businesses. Version 1.2.4.

---

## Completed Work (Session 2 — same day)

### 6. Post-Save Dialog After Invoice Creation

**Problem:** After creating an invoice, the modal just closed. User had no quick way to print or send the invoice.

**Changes:**
- **`InvoiceModal.tsx`**: Added `onPrint` and `onWhatsApp` callback props. After successful create, shows a post-save overlay dialog with Print / Send WhatsApp / Close buttons instead of closing immediately. Edit mode still closes normally.
- **`InvoicesPanel.tsx`**: `handleSave` now returns `{ success, id }` with the created invoice ID. Both create and view InvoiceModal instances receive `onPrint` and `onWhatsApp` callbacks that open PrintPreviewModal.
- **`global.css`**: Added `.post-save-overlay`, `.post-save-dialog`, `.post-save-actions` styles — dark overlay with centered dialog, full-width stacked buttons.

### 7. Print Button Event Bubbling Fix

**Problem:** Clicking "Print" in the invoice list also triggered the row's `onClick` which opened the InvoiceModal in view mode first.

**Change:** `InvoicesPanel.tsx` — Added `e.stopPropagation()` to the Print button click handler so it only opens PrintPreviewModal directly.

---

## Completed Work (Session 1)

### 1. Legacy MDB Import — D% and Remarks
### 2. Invoice Modal — UX Improvements (wider modal, bigger columns)
### 3. Invoice Modal — Auto-Add Rows & Keyboard Navigation
### 4. PurchaseInvoiceModal — SearchableSelect

*(See earlier sections for details)*

---

## Key Architecture Notes

| Aspect | Detail |
|--------|--------|
| Build | `npm run build` (electron-vite, 3 targets) |
| Dev | `npm run dev` |
| DB | better-sqlite3, WAL mode, raw SQL |
| IPC | Channel strings in `constants.ts` → `preload.ts` contextBridge → `ipcMain.handle` |
| Screen flow | `useState<Screen>` in `App.tsx`: login → company → fy → app |
| Schema | 17 tables, additive migrations via PRAGMA checks |
| Legacy import | `mdb-import.ts` (~2400 lines) |
| No linter/typecheck | Edit with discipline |

---

## Known Issues / TODOs

1. **Print.ts** — `discount_pct` and `remarks` not displayed in printed invoices
2. **Re-import required** — Data imported before D%/Remarks code was added will have zero values
3. **Column name detection** — If D% still shows as `-` after re-import, check DevTools console for diagnostic logs

---

## File Map (Modified This Session)

```
database/schema.sql              — discount_pct, remarks columns
src/main/database.ts             — migrations for existing DBs
src/shared/types.ts              — InvoiceItem interface
src/main/mdb-import.ts           — parseInventoryItems, parseBillMasterItems, importInvoices, importInvoicesForFy
src/main/invoice.ts              — createInvoice, updateInvoice, getInvoiceItems
src/main/purchase-invoice.ts     — createPurchaseInvoice, getPurchaseInvoiceItems
src/renderer/components/InvoiceModal.tsx        — auto-add rows, keyboard nav, modal-wide, post-save dialog
src/renderer/components/PurchaseInvoiceModal.tsx — auto-add rows, keyboard nav, SearchableSelect, modal-wide
src/renderer/components/InvoicesPanel.tsx       — stopPropagation on Print, handleSave returns id, onPrint/onWhatsApp props
src/renderer/styles/global.css   — modal-wide, column widths, input styling, post-save dialog
```

**Problem:** Speed Plus MDB files have `D%` (Discount %) and `Remarks` columns at the line-item level. These were not being imported into LedgerMitra.

**Changes:**
- **Schema** (`database/schema.sql`): Added `discount_pct DECIMAL(5,2) DEFAULT 0` and `remarks TEXT` to `invoice_items` and `purchase_invoice_items` tables
- **Migrations** (`src/main/database.ts`): Additive `ALTER TABLE` migrations guarded by `PRAGMA table_info()` checks — runs on every startup
- **Types** (`src/shared/types.ts`): `InvoiceItem` interface updated with `discount_pct?: number` and `remarks?: string`
- **MDB Parser** (`src/main/mdb-import.ts`):
  - `parseInventoryItems()` and `parseBillMasterItems()` now extract D% and Remarks via `pickColumn()`
  - Column matching broadened: `D%`, `D %`, `Disc%`, `DiscountPercentage`, `Discount`, regex `^d\s*%$`, `disc.*pct|disc.*percent|discount.*pct|discount.*percent`
  - Remarks matching: `Remarks`, `Remark`, `Narration`, `ShortNarration`, `Note`, regex `remark|narration|note`
  - Diagnostic logging added: logs which columns were found and how many items had discount/remarks data
- **Import Pipeline** (`importInvoices()` and `importInvoicesForFy()`): Map type annotations fixed to include `discountPct` and `remarks` — previously typed narrowly, causing `li.discountPct` to resolve to `undefined`
- **Invoice CRUD** (`src/main/invoice.ts`): `createInvoice()` and `updateInvoice()` accept and store `discount_pct` and `remarks` per item
- **Purchase Invoice CRUD** (`src/main/purchase-invoice.ts`): `createPurchaseInvoice()` and `getPurchaseInvoiceItems()` handle new fields

**Storage convention:** D% stored as percentage (not absolute amount). Remarks stored at item level, not header level.

### 2. Invoice Modal — UX Improvements

**Problem:** The invoice creation modal was too small for 8 columns (row#, product, qty, rate, gst%, d%, amount, remarks). Inputs were cramped and unusable.

**Changes:**
- **CSS** (`src/renderer/styles/global.css`):
  - New `.modal-content.modal-wide { max-width: 1100px }` class
  - Column widths increased: product 200→260px, qty 80→90px, rate 100→110px, gst 80→85px, discount 70→80px, remarks 120→150px, amount 100→110px
  - Product name max-width: 250→320px
  - Table font-size: 0.9→0.95rem
  - Added `.items-table input/select` styling with proper padding, border, focus state
- **Components**: Both `InvoiceModal.tsx` and `PurchaseInvoiceModal.tsx` now use `modal-wide` class

### 3. Invoice Modal — Auto-Add Rows & Keyboard Navigation

**Problem:** Users had to click "+ Add item" for every new row. No keyboard flow.

**Changes** (in `InvoiceModal.tsx` and `PurchaseInvoiceModal.tsx`):
- Auto-add empty row when product is selected in the last row
- Enter key advances focus: Product → Qty → Rate → GST% → D% → next row
- Row numbers displayed (`#` column)
- Empty rows (no product, zero amounts) auto-filtered on save
- `calcTotals()` applies discount before tax calculation

### 4. PurchaseInvoiceModal — SearchableSelect

**Problem:** Purchase invoice modal used plain `<select>` for product selection — poor UX with many products.

**Change:** Upgraded to `SearchableSelect` component (same as InvoiceModal).

### 5. Print Support

**Status:** `discount_pct` and `remarks` fields are stored in DB but `src/main/print.ts` may not yet display them in printed invoices. **TODO: verify and update print.ts if needed.**

---

## Key Architecture Notes

| Aspect | Detail |
|--------|--------|
| Build | `npm run build` (electron-vite, 3 targets) |
| Dev | `npm run dev` |
| DB | better-sqlite3, WAL mode, raw SQL |
| IPC | Channel strings in `constants.ts` → `preload.ts` contextBridge → `ipcMain.handle` |
| Screen flow | `useState<Screen>` in `App.tsx`: login → company → fy → app |
| Schema | 17 tables, additive migrations via PRAGMA checks |
| Legacy import | `mdb-import.ts` (~2400 lines) |
| No linter/typecheck | Edit with discipline |

---

## Known Issues / TODOs

1. **Print.ts** — `discount_pct` and `remarks` not displayed in printed invoices
2. **Re-import required** — Data imported before D%/Remarks code was added will have zero values; user must re-import MDB files
3. **Column name detection** — If D% still shows as `-` after re-import, check DevTools console for `[MDB] Inventory: discount column found = "..."` diagnostic logs to verify actual MDB column names

---

## File Map (Modified This Session)

```
database/schema.sql              — discount_pct, remarks columns
src/main/database.ts             — migrations for existing DBs
src/shared/types.ts              — InvoiceItem interface
src/main/mdb-import.ts           — parseInventoryItems, parseBillMasterItems, importInvoices, importInvoicesForFy
src/main/invoice.ts              — createInvoice, updateInvoice, getInvoiceItems
src/main/purchase-invoice.ts     — createPurchaseInvoice, getPurchaseInvoiceItems
src/renderer/components/InvoiceModal.tsx        — auto-add rows, keyboard nav, modal-wide
src/renderer/components/PurchaseInvoiceModal.tsx — auto-add rows, keyboard nav, SearchableSelect, modal-wide
src/renderer/styles/global.css   — modal-wide, column widths, input styling
```
