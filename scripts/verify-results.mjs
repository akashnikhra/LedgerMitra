import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(__dirname, '..', 'data-test', 'accounting-test.db'), { readonly: true });

console.log('=== DATA INTEGRITY VERIFICATION ===\n');

console.log('1. CUSTOMER LEDGER SUMS:');
const custs = db.prepare('SELECT id,name,current_balance FROM customers').all();
for (const c of custs) {
  const s = db.prepare('SELECT COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c FROM ledger_entries WHERE customer_id=? AND company_id=1').get(c.id);
  console.log(`  ${c.name}: Dr ${s.d}, Cr ${s.c}, Net ${s.d - s.c}, Bal ${c.current_balance} ${(s.d - s.c) === c.current_balance ? 'OK' : 'MISMATCH'}`);
}

console.log('\n2. SUPPLIER LEDGER SUMS:');
const supps = db.prepare('SELECT id,name,current_balance FROM suppliers').all();
for (const s of supps) {
  const l = db.prepare('SELECT COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c FROM ledger_entries WHERE supplier_id=? AND company_id=1').get(s.id);
  console.log(`  ${s.name}: Dr ${l.d}, Cr ${l.c}, Net ${l.d - l.c}, -(Net) ${-(l.d - l.c)}, Bal ${s.current_balance} ${(-(l.d - l.c)) === s.current_balance ? 'OK' : 'MISMATCH'}`);
}

console.log('\n3. STOCK INTEGRITY:');
const prods = db.prepare('SELECT name,stock_qty,opening_stock FROM products').all();
for (const p of prods) {
  console.log(`  ${p.name}: stock ${p.stock_qty}, opening ${p.opening_stock}`);
}

console.log('\n4. INVOICE OUTSTANDING:');
const invs = db.prepare('SELECT invoice_no,invoice_type,total_amount,total_remaining FROM invoices').all();
for (const i of invs) {
  console.log(`  ${i.invoice_no} (${i.invoice_type}): Total ${i.total_amount}, Remaining ${i.total_remaining}`);
}

console.log('\n5. RECEIPT ALLOCATIONS:');
const allocs = db.prepare('SELECT ra.receipt_id, ra.invoice_id, ra.allocated_amount FROM receipt_allocations ra').all();
for (const r of allocs) {
  console.log(`  Receipt ${r.receipt_id} -> Invoice ${r.invoice_id}: ${r.allocated_amount}`);
}

console.log('\n6. FY CARRY-FORWARDS:');
const cfs = db.prepare('SELECT customer_id, from_fy_id, to_fy_id, amount, balance_type FROM fy_carry_forwards').all();
for (const cf of cfs) {
  console.log(`  Customer ${cf.customer_id}: FY ${cf.from_fy_id} -> FY ${cf.to_fy_id}: ${cf.amount} ${cf.balance_type}`);
}

console.log('\n7. LEDGER ENTRIES (ALL):');
const entries = db.prepare('SELECT id, entry_date, entry_type, debit, credit, customer_id, supplier_id FROM ledger_entries WHERE company_id=1 ORDER BY id').all();
for (const e of entries) {
  const entity = e.customer_id ? `Cust ${e.customer_id}` : (e.supplier_id ? `Supp ${e.supplier_id}` : '');
  console.log(`  #${e.id} ${e.entry_date} ${e.entry_type.padEnd(16)} Dr ${String(e.debit).padStart(8)} Cr ${String(e.credit).padStart(8)} ${entity}`);
}

db.close();
console.log('\n=== VERIFICATION COMPLETE ===');
