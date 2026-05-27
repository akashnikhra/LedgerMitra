# Fix Opening Balance Double-Counting

## Root Cause

The MDB import creates OPENING_BALANCE ledger entries from Ledger table carry-forward rows. These duplicate customers.opening_balance already set by importCustomers, causing balance inflation.

## Changes

### 1. src/main/mdb-import.ts — Skip OB ledger imports
Replace importOpeningBalances with no-op returning { imported: 0, skipped: 0 }.

### 2. src/main/mdb-import.ts — Fix buildFyChain
Remove queryOne for OB entries and source_ledger_entry_id column. Insert carry-forward directly.

### 3. src/main/mdb-import.ts — Fix getCustomerBalanceTrace
Remove OR entry_type = 'OPENING_BALANCE' from WHERE.

### 4. src/main/database.ts — Fix migration
Add AND entry_type != 'OPENING_BALANCE' to SUM subquery.

### 5. src/main/ledger.ts — Fix getYearLedger netBalance
Return openingBalance when no entries exist and customerId is set. Add early openingBalance read.

### 6. src/main/ledger.ts — Fix getLedgerSummary
Add AND entry_type != 'OPENING_BALANCE' to SUM query.

### 7. src/renderer/components/LedgerTable.tsx — Remove OB badge
Remove isOpeningBalance, simplify renderType, remove row-muted class.

### 8. src/renderer/components/BalanceTraceModal.tsx — Remove [OB] badge
Remove conditional [OB] badge rendering.

### 9. Rebuild
Run: npx electron-vite build
