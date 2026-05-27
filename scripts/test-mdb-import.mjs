/**
 * Diagnose Speed Plus MDB columns/sample values for invoice & ledger import.
 * Usage: node scripts/test-mdb-import.mjs [path-to-spd.mdb]
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import MDBReader from 'mdb-reader';

const PASSWORD = 'allthebest';
const ROOTS = [
  process.argv[2],
  process.env.LEDGERMITRA_LEGACY_DATA,
  'F:\\accounting_software\\Upload\\Data',
  join(process.cwd(), 'Upload', 'Data')
].filter(Boolean);

function findMdbFiles(dir, depth = 0) {
  if (depth > 4 || !existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    try {
      const st = statSync(p);
      if (st.isDirectory()) out.push(...findMdbFiles(p, depth + 1));
      else if (/\.(mdb|bmw)$/i.test(name)) out.push(p);
    } catch {
      /* skip */
    }
  }
  return out;
}

let mdbPath = process.argv[2];
if (!mdbPath || !existsSync(mdbPath)) {
  for (const root of ROOTS) {
    if (!root || !existsSync(root)) continue;
    const files = findMdbFiles(root);
    if (files.length) {
      mdbPath = files[0];
      break;
    }
  }
}

if (!mdbPath) {
  console.error('No MDB file found. Pass path as argv[2] or set LEDGERMITRA_LEGACY_DATA.');
  process.exit(1);
}

console.log('File:', mdbPath);
const reader = new MDBReader(readFileSync(mdbPath), { password: PASSWORD });
const tables = reader.getTableNames().filter((t) => !t.startsWith('MSys'));
console.log('Tables:', tables.join(', '));

function sampleTable(name, limit = 3) {
  if (!tables.some((t) => t.toLowerCase() === name.toLowerCase())) {
    console.log(`\n--- ${name}: NOT FOUND ---`);
    return;
  }
  const actual = tables.find((t) => t.toLowerCase() === name.toLowerCase());
  const table = reader.getTable(actual);
  const cols = table.getColumnNames();
  const rows = table.getData({ rowLimit: limit });
  console.log(`\n--- ${actual} (${table.rowCount} rows) ---`);
  console.log('Columns:', cols.join(', '));
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const summary = {};
    for (const c of cols) {
      const v = row[c];
      summary[c] =
        v instanceof Date
          ? `Date(${v.toISOString()})`
          : v !== null && typeof v === 'object'
            ? JSON.stringify(v)
            : `${typeof v}:${v}`;
    }
    console.log(`Row ${i + 1}:`, JSON.stringify(summary));
  }
}

sampleTable('BillMaster', 5);
sampleTable('Ledger', 5);
sampleTable('Account', 3);

// Dry-run counts using same rules as mdb-import.ts
const acc = reader.getTable('Account').getData();
const partyIds = new Set(
  acc
    .filter((row) => /customer|debtor|creditor|supplier|vendor|party/i.test(String(row.AccountsGroupName || '')))
    .map((row) => String(row.AccountID))
);
const ledger = reader.getTable('Ledger').getData();
let invoices = 0;
let payments = 0;
let skippedOther = 0;
const seen = new Set();
for (const row of ledger) {
  const dc = String(row.DC || '').toUpperCase();
  const tran = String(row.TranType || '').toLowerCase();
  const id = String(row.AccountID ?? '');
  const amt = parseFloat(row.Amount) || 0;
  if (!partyIds.has(id) || amt <= 0) {
    skippedOther++;
    continue;
  }
  if (dc === 'D' && tran.includes('sale') && !tran.includes('return')) {
    const key = `${row.VoucherID}-${id}`;
    if (!seen.has(key)) {
      seen.add(key);
      invoices++;
    }
  } else if (dc === 'C' && /receipt|payment|collection|received/.test(tran)) {
    payments++;
  } else {
    skippedOther++;
  }
}
console.log('\n--- Import dry-run (party accounts only) ---');
console.log({ partyAccounts: partyIds.size, invoices, payments, skippedOther });
