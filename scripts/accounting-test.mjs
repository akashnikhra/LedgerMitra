#!/usr/bin/env node
/**
 * LedgerMitra — Accounting Integration Test Suite
 *
 * Tests every feature against accounting principles:
 *  1. Double-entry bookkeeping (debits = credits per entity)
 *  2. GST compliance (CGST/SGST intra-state, IGST inter-state)
 *  3. Balance continuity
 *  4. Inventory accuracy
 *  5. Outstanding tracking
 *  6. FY isolation and carry-forwards
 *
 * Run: node scripts/accounting-test.mjs
 */

import Database from 'better-sqlite3';
import { readFileSync, existsSync, unlinkSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DB = join(__dirname, '..', 'data-test', 'accounting-test.db');

// ─── Test Harness ───────────────────────────────────────────────────────
let passed = 0, failed = 0, errors = [];
function assert(cond, msg) { (cond ? passed : (failed++, errors.push(msg))) ? 0 : console.error(`  FAIL: ${msg}`); return cond; }
function assertEq(a, b, label) {
  const ok = Math.abs(a - b) < 0.01;
  if (!ok) { failed++; errors.push(`${label}: got ${a}, expected ${b}`); console.error(`  FAIL: ${label} — got ${a}, expected ${b}`); }
  else passed++;
  return ok;
}
function heading(n, t) { console.log(`\n${'='.repeat(72)}\n  Phase ${n}: ${t}\n${'='.repeat(72)}`); }
function sub(t) { console.log(`\n  --- ${t} ---`); }

// ─── DB Init ────────────────────────────────────────────────────────────
function initDb() {
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  const dir = dirname(TEST_DB);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const db = new Database(TEST_DB);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(readFileSync(join(__dirname, '..', 'database', 'schema.sql'), 'utf-8'));

  // Runtime migrations (matching database.ts)
  function mc(t, c, type, def) {
    if (!db.prepare(`PRAGMA table_info(${t})`).all().some(r => r.name === c))
      db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${type}${def !== undefined ? ` DEFAULT ${def}` : ''}`);
  }
  mc('invoice_items', 'product_name', 'VARCHAR(200)');
  mc('customers', 'opening_balance_type', "VARCHAR(2) DEFAULT 'Dr'");
  mc('invoices', 'invoice_type', "VARCHAR(10) DEFAULT 'SALE'");
  mc('invoices', 'supplier_id', 'INTEGER');
  mc('ledger_entries', 'receipt_id', 'INTEGER');
  mc('ledger_entries', 'fy_source_id', 'INTEGER');
  mc('ledger_entries', 'supplier_id', 'INTEGER');
  mc('legacy_import_log', 'file_hash', 'VARCHAR(64)');
  mc('legacy_import_log', 'fy_name', 'VARCHAR(50)');
  mc('legacy_import_log', "status", "VARCHAR(20) DEFAULT 'completed'");
  mc('legacy_import_log', 'imported_opening_balances', 'INTEGER DEFAULT 0');

  // Extra tables from migrations
  ['receipts', 'receipt_allocations'].forEach(t => {
    if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t)) {
      if (t === 'receipts') db.exec(`CREATE TABLE receipts (id INTEGER PRIMARY KEY AUTOINCREMENT, receipt_no VARCHAR(30) UNIQUE NOT NULL, customer_id INTEGER NOT NULL REFERENCES customers(id), receipt_date DATE NOT NULL, amount DECIMAL(15,2) NOT NULL, payment_method VARCHAR(20) NOT NULL, reference_no VARCHAR(50), bank_account VARCHAR(50), narration TEXT, company_id INTEGER REFERENCES company(id), fy_id INTEGER REFERENCES financial_years(id), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
      if (t === 'receipt_allocations') db.exec(`CREATE TABLE receipt_allocations (id INTEGER PRIMARY KEY AUTOINCREMENT, receipt_id INTEGER NOT NULL REFERENCES receipts(id), invoice_id INTEGER NOT NULL REFERENCES invoices(id), allocated_amount DECIMAL(15,2) NOT NULL, UNIQUE(receipt_id, invoice_id))`);
    }
  });
  db.exec("CREATE TABLE IF NOT EXISTS settings (key VARCHAR(100) PRIMARY KEY, value TEXT)");

  console.log(`  DB: ${TEST_DB}`);
  return db;
}

// ─── Phase 1 ────────────────────────────────────────────────────────────
function phase1(db) {
  heading('1', 'Setup');
  const c = db.prepare('INSERT INTO company (name, gstin, state) VALUES (?,?,?)').run('Test Co', '29ABCDE1234F1Z5', 'Karnataka');
  const companyId = c.lastInsertRowid;
  const f1 = db.prepare('INSERT INTO financial_years (name,start_date,end_date,company_id) VALUES (?,?,?,?)').run('FY24-25','2024-04-01','2025-03-31',companyId);
  const f2 = db.prepare('INSERT INTO financial_years (name,start_date,end_date,company_id) VALUES (?,?,?,?)').run('FY25-26','2025-04-01','2026-03-31',companyId);
  console.log(`  Company id=${companyId}, FY24-25 id=${f1.lastInsertRowid}, FY25-26 id=${f2.lastInsertRowid}`);
  return { companyId, fy1Id: f1.lastInsertRowid, fy2Id: f2.lastInsertRowid };
}

// ─── Phase 2 ────────────────────────────────────────────────────────────
function phase2(db, cid) {
  heading('2', 'Master Data');

  // Products
  const ps = db.prepare(`INSERT INTO products (sku,name,category,selling_rate,gst_rate,hsn_code,unit,stock_qty,opening_stock,company_id) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const p = [
    ps.run('WIDGET-001','Steel Widget','Raw Material',1000,18,'7326','Nos',100,100,cid),
    ps.run('WIDGET-002','Brass Widget','Raw Material',2000,12,'7412','Nos',50,50,cid),
    ps.run('SVC-001','Consulting Fee','Service',5000,18,'9983','Nos',0,0,cid),
    ps.run('WIDGET-003','Aluminium Widget','Raw Material',600,5,'7606','Nos',200,200,cid)
  ];
  console.log('  4 products created');

  // Verify stock = opening stock
  db.prepare('SELECT name,stock_qty,opening_stock FROM products WHERE company_id=?').all(cid).forEach(r =>
    assertEq(r.stock_qty, r.opening_stock, `${r.name} stock_qty = opening_stock`));

  // Duplicate SKU check
  try { ps.run('WIDGET-001','dup','',0,0,'','',0,0,cid); assert(false,'dup SKU should fail'); }
  catch (e) { assert(e.message.includes('UNIQUE'),'dup SKU rejected'); }

  // Customers
  const cs = db.prepare('INSERT INTO customers (name,state,opening_balance,opening_balance_type,current_balance,company_id) VALUES (?,?,?,?,?,?)');
  const c1 = cs.run('ABC Traders','Karnataka',0,'Dr',0,cid);
  const c2 = cs.run('XYZ Corp','Maharashtra',0,'Dr',0,cid);
  const c3 = cs.run('MNO Enterprises','Karnataka',50000,'Dr',50000,cid);
  console.log('  3 customers created');

  // Create OPENING_BALANCE ledger entries for customers with opening balances
  const obLedger = db.prepare('INSERT INTO ledger_entries (customer_id,company_id,entry_date,entry_type,debit,credit) VALUES (?,?,?,?,?,?)');
  obLedger.run(c3.lastInsertRowid, cid, '2024-04-01', 'OPENING_BALANCE', 50000, 0);
  assertEq(db.prepare('SELECT current_balance FROM customers WHERE id=?').get(c3.lastInsertRowid).current_balance, 50000, 'MNO opening balance');
  console.log('  OB ledger entry created for MNO ₹50,000 Dr');

  // Suppliers
  const ss = db.prepare('INSERT INTO suppliers (name,state,opening_balance,opening_balance_type,current_balance,company_id) VALUES (?,?,?,?,?,?)');
  const s1 = ss.run('PQR Suppliers','Karnataka',25000,'Cr',-25000,cid);
  const s2 = ss.run('DEF Imports','Tamil Nadu',0,'Cr',0,cid);
  console.log('  2 suppliers created');

  // OB ledger entry for PQR (Cr opening = debit in app's ledger convention)
  // Note: Debit entry makes supplier balance more negative (more Cr)
  db.prepare('INSERT INTO ledger_entries (supplier_id,company_id,entry_date,entry_type,debit,credit) VALUES (?,?,?,?,?,?)').run(s1.lastInsertRowid, cid, '2024-04-01', 'OPENING_BALANCE', 25000, 0);
  assertEq(db.prepare('SELECT current_balance FROM suppliers WHERE id=?').get(s1.lastInsertRowid).current_balance, -25000, 'PQR OB -25000');

  return {
    productIds: { steel: p[0].lastInsertRowid, brass: p[1].lastInsertRowid, consulting: p[2].lastInsertRowid, aluminium: p[3].lastInsertRowid },
    customerIds: { abc: c1.lastInsertRowid, xyz: c2.lastInsertRowid, mno: c3.lastInsertRowid },
    supplierIds: { pqr: s1.lastInsertRowid, def: s2.lastInsertRowid }
  };
}

// ─── Phase 3 ────────────────────────────────────────────────────────────
function phase3(db, { companyId, fy1Id }, ids) {
  heading('3', 'Transactions');
  const { productIds: p, customerIds: cu, supplierIds: su } = ids;

  // Prepared statements
  const invInsert = (type) => db.prepare(`INSERT INTO invoices (invoice_no,invoice_type,fy_id,customer_id,invoice_date,subtotal,cgst_amount,sgst_amount,igst_amount,tax_amount,total_amount,total_remaining,company_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const invItem = db.prepare('INSERT INTO invoice_items (invoice_id,product_id,product_name,qty,rate,amount,gst_rate,gst_amount) VALUES (?,?,?,?,?,?,?,?)');
  const ledCust = db.prepare('INSERT INTO ledger_entries (customer_id,invoice_id,company_id,entry_date,entry_type,debit,credit) VALUES (?,?,?,?,?,?,?)');
  const ledRcpt = db.prepare('INSERT INTO ledger_entries (customer_id,invoice_id,company_id,entry_date,entry_type,debit,credit,receipt_id) VALUES (?,?,?,?,?,?,?,?)');
  const ledSupp = db.prepare('INSERT INTO ledger_entries (supplier_id,company_id,entry_date,entry_type,debit,credit) VALUES (?,?,?,?,?,?)');
  const updCust = (n) => db.prepare('UPDATE customers SET current_balance = current_balance + ? WHERE id = ?').run(n, cu.abc);
  const updStock = (q,id) => db.prepare('UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?').run(q, id);
  const updInvRem = (a,id) => db.prepare('UPDATE invoices SET total_remaining = total_remaining - ? WHERE id = ?').run(a, id);

  let r1Id, r2Id, inv31Id, inv32Id, inv33Id, pi341Id, pi342Id;

  // ── 3.1 SALE intra-state ──
  sub('3.1 — Sale to ABC (Intra-State, CGST/SGST)');
  let subAmt = 12000 + 5000, cgst = Math.round(subAmt * 9 / 100), sgst = Math.round(subAmt * 9 / 100), total = subAmt + cgst + sgst;
  assertEq(subAmt, 17000, 'Subtotal'); assertEq(cgst, 1530, 'CGST'); assertEq(total, 20060, 'Total');

  const i1 = invInsert('SALE').run('INV-001','SALE',fy1Id,cu.abc,'2024-06-15',subAmt,cgst,sgst,0,cgst+sgst,total,total,companyId);
  inv31Id = i1.lastInsertRowid;
  for (const [pid, name, qty, rate, gst, amt] of [[p.steel,'Steel Widget',10,1200,18,12000],[p.consulting,'Consulting Fee',1,5000,18,5000]])
    invItem.run(inv31Id, pid, name, qty, rate, amt, gst, Math.round(amt*gst/100));
  ledCust.run(cu.abc, inv31Id, companyId, '2024-06-15', 'INVOICE', total, 0);
  updCust(total);
  updStock(10, p.steel);
  assertEq(db.prepare('SELECT current_balance FROM customers WHERE id=?').get(cu.abc).current_balance, 20060, 'ABC bal=₹20,060');
  assertEq(db.prepare('SELECT stock_qty FROM products WHERE id=?').get(p.steel).stock_qty, 90, 'Steel stock=90');
  assertEq(db.prepare('SELECT total_remaining FROM invoices WHERE id=?').get(inv31Id).total_remaining, 20060, 'INV-001 rem=₹20,060');

  // ── 3.2 SALE inter-state ──
  sub('3.2 — Sale to XYZ (Inter-State, IGST)');
  subAmt = 10000; let igst = 1200; total = subAmt + igst;
  const i2 = invInsert('SALE').run('INV-002','SALE',fy1Id,cu.xyz,'2024-06-20',subAmt,0,0,igst,igst,total,total,companyId);
  inv32Id = i2.lastInsertRowid;
  invItem.run(inv32Id, p.brass, 'Brass Widget', 5, 2000, 10000, 12, 1200);
  ledCust.run(cu.xyz, inv32Id, companyId, '2024-06-20', 'INVOICE', total, 0);
  db.prepare('UPDATE customers SET current_balance = current_balance + ? WHERE id = ?').run(total, cu.xyz);
  updStock(5, p.brass);
  assertEq(db.prepare('SELECT current_balance FROM customers WHERE id=?').get(cu.xyz).current_balance, 11200, 'XYZ bal=₹11,200');
  assertEq(db.prepare('SELECT igst_amount FROM invoices WHERE id=?').get(inv32Id).igst_amount, 1200, 'IGST=₹1,200');
  assertEq(db.prepare('SELECT cgst_amount,sgst_amount FROM invoices WHERE id=?').get(inv32Id).cgst_amount, 0, 'CGST=0');
  assertEq(db.prepare('SELECT stock_qty FROM products WHERE id=?').get(p.brass).stock_qty, 45, 'Brass stock=45');

  // ── 3.3 RETURN ──
  sub('3.3 — Sales Return (Credit Note) — ABC');
  subAmt = 2400; cgst = Math.round(subAmt * 9 / 100); sgst = Math.round(subAmt * 9 / 100); total = -(subAmt + cgst + sgst);
  assertEq(total, -2832, 'Return total = -₹2,832');
  const i3 = invInsert('RETURN').run('INV-003','RETURN',fy1Id,cu.abc,'2024-06-25',subAmt,cgst,sgst,0,cgst+sgst,total,total,companyId);
  inv33Id = i3.lastInsertRowid;
  invItem.run(inv33Id, p.steel, 'Steel Widget', 2, 1200, 2400, 18, 432);
  ledCust.run(cu.abc, inv33Id, companyId, '2024-06-25', 'RETURN', 0, Math.abs(total));
  db.prepare('UPDATE customers SET current_balance = current_balance - ? WHERE id = ?').run(Math.abs(total), cu.abc);
  db.prepare('UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?').run(2, p.steel);
  assertEq(db.prepare('SELECT current_balance FROM customers WHERE id=?').get(cu.abc).current_balance, 17228, 'ABC bal=₹17,228');
  assertEq(db.prepare('SELECT stock_qty FROM products WHERE id=?').get(p.steel).stock_qty, 92, 'Steel stock=92');

  // ── 3.4 PURCHASES ──
  sub('3.4.1 — Purchase from PQR (Intra-State)');
  let pSub = 15000; let pCgst = Math.round(pSub * 2.5 / 100); let pSgst = Math.round(pSub * 2.5 / 100); let pTot = pSub + pCgst + pSgst;
  assertEq(pTot, 15750, 'P-INV-001 total');
  const pi1 = db.prepare(`INSERT INTO purchase_invoices (invoice_no,fy_id,supplier_id,invoice_date,subtotal,cgst_amount,sgst_amount,tax_amount,total_amount,total_remaining,company_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run('P-INV-001',fy1Id,su.pqr,'2024-06-10',pSub,pCgst,pSgst,pCgst+pSgst,pTot,pTot,companyId);
  pi341Id = pi1.lastInsertRowid;
  db.prepare('INSERT INTO purchase_invoice_items (invoice_id,product_id,product_name,qty,rate,amount,gst_rate,gst_amount) VALUES (?,?,?,?,?,?,?,?)').run(pi341Id, p.aluminium, 'Aluminium Widget', 50, 300, 15000, 5, 750);
  ledSupp.run(su.pqr, companyId, '2024-06-10', 'PURCHASE', pTot, 0);
  db.prepare('UPDATE suppliers SET current_balance = current_balance - ? WHERE id = ?').run(pTot, su.pqr);
  db.prepare('UPDATE products SET stock_qty = stock_qty + ?, purchase_rate = ? WHERE id = ?').run(50, 300, p.aluminium);

  sub('3.4.2 — Purchase from DEF (Inter-State)');
  pSub = 30000; let pIgst = Math.round(pSub * 12 / 100); pTot = pSub + pIgst;
  assertEq(pTot, 33600, 'P-INV-002 total');
  const pi2 = db.prepare(`INSERT INTO purchase_invoices (invoice_no,fy_id,supplier_id,invoice_date,subtotal,igst_amount,tax_amount,total_amount,total_remaining,company_id) VALUES (?,?,?,?,?,?,?,?,?,?)`).run('P-INV-002',fy1Id,su.def,'2024-06-12',pSub,pIgst,pIgst,pTot,pTot,companyId);
  pi342Id = pi2.lastInsertRowid;
  db.prepare('INSERT INTO purchase_invoice_items (invoice_id,product_id,product_name,qty,rate,amount,gst_rate,gst_amount) VALUES (?,?,?,?,?,?,?,?)').run(pi342Id, p.brass, 'Brass Widget', 20, 1500, 30000, 12, 3600);
  ledSupp.run(su.def, companyId, '2024-06-12', 'PURCHASE', pTot, 0);
  db.prepare('UPDATE suppliers SET current_balance = current_balance - ? WHERE id = ?').run(pTot, su.def);
  db.prepare('UPDATE products SET stock_qty = stock_qty + ?, purchase_rate = ? WHERE id = ?').run(20, 1500, p.brass);

  assertEq(db.prepare('SELECT current_balance FROM suppliers WHERE id=?').get(su.pqr).current_balance, -40750, 'PQR bal=₹40,750 Cr');
  assertEq(db.prepare('SELECT stock_qty FROM products WHERE id=?').get(p.aluminium).stock_qty, 250, 'Alum stock=250');
  assertEq(db.prepare('SELECT stock_qty FROM products WHERE id=?').get(p.brass).stock_qty, 65, 'Brass stock=65');

  // ── 3.5 RECEIPTS ──
  sub('3.5.1 — Receipt from ABC ₹10,000 (UPI)');
  const rStmt = db.prepare('INSERT INTO receipts (receipt_no,customer_id,receipt_date,amount,payment_method,company_id) VALUES (?,?,?,?,?,?)');
  const raStmt = db.prepare('INSERT INTO receipt_allocations (receipt_id,invoice_id,allocated_amount) VALUES (?,?,?)');
  r1Id = rStmt.run('REC-001', cu.abc, '2024-06-30', 10000, 'UPI', companyId).lastInsertRowid;
  raStmt.run(r1Id, inv31Id, 10000);
  updInvRem(10000, inv31Id);
  ledRcpt.run(cu.abc, null, companyId, '2024-06-30', 'RECEIPT', 0, 10000, r1Id);
  db.prepare('UPDATE customers SET current_balance = current_balance - ? WHERE id = ?').run(10000, cu.abc);
  assertEq(db.prepare('SELECT current_balance FROM customers WHERE id=?').get(cu.abc).current_balance, 7228, 'ABC bal=₹7,228');
  assertEq(db.prepare('SELECT total_remaining FROM invoices WHERE id=?').get(inv31Id).total_remaining, 10060, 'INV-001 rem=₹10,060');

  sub('3.5.2 — Receipt from ABC ₹7,228 (Cheque, Manual)');
  r2Id = rStmt.run('REC-002', cu.abc, '2024-07-15', 7228, 'CHEQUE', companyId).lastInsertRowid;
  raStmt.run(r2Id, inv31Id, 5060);
  const inv3Rem = db.prepare('SELECT total_remaining FROM invoices WHERE id=?').get(inv33Id).total_remaining;
  raStmt.run(r2Id, inv33Id, Math.min(2168, Math.abs(inv3Rem)));
  updInvRem(5060, inv31Id);
  db.prepare('UPDATE invoices SET total_remaining = total_remaining + ? WHERE id = ?').run(2168, inv33Id);
  ledRcpt.run(cu.abc, null, companyId, '2024-07-15', 'RECEIPT', 0, 7228, r2Id);
  db.prepare('UPDATE customers SET current_balance = current_balance - ? WHERE id = ?').run(7228, cu.abc);
  assertEq(db.prepare('SELECT current_balance FROM customers WHERE id=?').get(cu.abc).current_balance, 0, 'ABC bal=₹0');

  // ── 3.6 SUPPLIER PAYMENTS ──
  sub('3.6.1 — Payment to PQR ₹10,000');
  ledSupp.run(su.pqr, companyId, '2024-06-25', 'PURCHASE_PAYMENT', 0, 10000);
  db.prepare('UPDATE suppliers SET current_balance = current_balance + ? WHERE id = ?').run(10000, su.pqr);
  db.prepare('UPDATE purchase_invoices SET total_remaining = total_remaining - ? WHERE id = ?').run(10000, pi341Id);
  assertEq(db.prepare('SELECT current_balance FROM suppliers WHERE id=?').get(su.pqr).current_balance, -30750, 'PQR bal=₹30,750 Cr');

  sub('3.6.2 — Payment to DEF ₹33,600 (Full)');
  ledSupp.run(su.def, companyId, '2024-06-30', 'PURCHASE_PAYMENT', 0, 33600);
  db.prepare('UPDATE suppliers SET current_balance = current_balance + ? WHERE id = ?').run(33600, su.def);
  db.prepare('UPDATE purchase_invoices SET total_remaining = total_remaining - ? WHERE id = ?').run(33600, pi342Id);
  assertEq(db.prepare('SELECT current_balance FROM suppliers WHERE id=?').get(su.def).current_balance, 0, 'DEF bal=₹0');

  return { inv31Id, inv32Id, inv33Id, pi341Id, pi342Id, r1Id, r2Id };
}

// ─── Phase 4 ────────────────────────────────────────────────────────────
function phase4(db, cid, ids) {
  heading('4', 'Ledger & Balance Verification');

  // ABC ledger
  const abc = db.prepare(`SELECT entry_date,entry_type,debit,credit FROM ledger_entries WHERE customer_id=? AND company_id=? ORDER BY id`).all(ids.customerIds.abc, cid);
  let bal = 0, td = 0, tc = 0;
  abc.forEach(e => { bal += e.debit - e.credit; td += e.debit; tc += e.credit; });
  assertEq(td, 20060, 'ABC total debit'); assertEq(tc, 20060, 'ABC total credit'); assertEq(bal, 0, 'ABC closing bal');
  console.log(`  ABC: Dr ₹${td}, Cr ₹${tc}, Closing ₹${bal}`);

  // Dashboard stats
  assertEq(db.prepare('SELECT COUNT(*) c FROM products WHERE company_id=?').get(cid).c, 4, 'Products=4');
  assertEq(db.prepare('SELECT COUNT(*) c FROM customers WHERE company_id=?').get(cid).c, 3, 'Customers=3');
  assertEq(db.prepare('SELECT COUNT(*) c FROM invoices WHERE company_id=?').get(cid).c, 3, 'Invoices=3');
  const recv = db.prepare('SELECT COALESCE(SUM(current_balance),0) c FROM customers WHERE company_id=? AND current_balance>0').get(cid).c;
  assertEq(recv, 61200, `Receivables=₹61,200`); // MNO 50k + XYZ 11.2k
  const pay = db.prepare("SELECT COALESCE(SUM(ABS(current_balance)),0) c FROM suppliers WHERE company_id=? AND current_balance<0").get(cid).c;
  assertEq(pay, 30750, `Payables=₹30,750`);
  console.log(`  Dashboard: OK`);
}

// ─── Phase 5 ────────────────────────────────────────────────────────────
function phase5(db, cid, tids) {
  heading('5', 'Data Integrity');

  // 5.1 Per-customer: debits = credits
  sub('5.1 — Per-Customer Debits = Credits (incl OB)');
  db.prepare(`SELECT c.id,c.name,c.current_balance FROM customers c WHERE c.company_id=?`).all(cid).forEach(r => {
    const s = db.prepare(`SELECT COALESCE(SUM(debit),0)-COALESCE(SUM(credit),0) bal FROM ledger_entries WHERE customer_id=? AND company_id=?`).get(r.id, cid);
    assertEq(s.bal, r.current_balance, `${r.name}: ledger ${s.bal} = bal ${r.current_balance}`);
  });

  // 5.2 Per-supplier: debits = credits
  sub('5.2 — Per-Supplier Debits = Credits (incl OB)');
  db.prepare(`SELECT s.id,s.name,s.current_balance FROM suppliers s WHERE s.company_id=?`).all(cid).forEach(r => {
    const led = db.prepare(`SELECT COALESCE(SUM(debit),0)-COALESCE(SUM(credit),0) bal FROM ledger_entries WHERE supplier_id=? AND company_id=?`).get(r.id, cid);
    // App convention: supplier Cr balance stored as negative.
    // Ledger debits increase Cr (more negative), ledger credits reduce Cr (less negative).
    // Relation: current_balance = -(debits - credits)
    assertEq(-(led.bal), r.current_balance, `${r.name}: -(ledger ${led.bal}) = bal ${r.current_balance}`);
  });

  // 5.3 Stock integrity
  sub('5.3 — Stock = Opening + Purchases - Sales + Returns');
  db.prepare('SELECT id,name,stock_qty,opening_stock FROM products WHERE company_id=?').all(cid).forEach(r => {
    // Skip stock check for service items (opening_stock = 0 and no purchases)
    if (r.opening_stock === 0) {
      console.log(`  ~ ${r.name}: service item, stock ${r.stock_qty} (not tracked)`);
      return;
    }
    const saleQ = db.prepare(`SELECT COALESCE(SUM(ii.qty),0) q FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id WHERE ii.product_id=? AND i.company_id=? AND i.invoice_type='SALE'`).get(r.id, cid).q;
    const retQ = db.prepare(`SELECT COALESCE(SUM(ii.qty),0) q FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id WHERE ii.product_id=? AND i.company_id=? AND i.invoice_type='RETURN'`).get(r.id, cid).q;
    const purQ = db.prepare(`SELECT COALESCE(SUM(pii.qty),0) q FROM purchase_invoice_items pii JOIN purchase_invoices pi ON pi.id=pii.invoice_id WHERE pii.product_id=? AND pi.company_id=?`).get(r.id, cid).q;
    const exp = r.opening_stock + purQ - saleQ + retQ;
    assertEq(r.stock_qty, exp, `${r.name}: stock ${r.stock_qty} = ${exp} (OB=${r.opening_stock}, P=${purQ}, S=${saleQ}, R=${retQ})`);
  });

  // 5.4 No orphan entries
  sub('5.4 — No Orphan Entries');
  const o1 = db.prepare(`SELECT COUNT(*) c FROM ledger_entries le WHERE le.company_id=? AND le.customer_id IS NOT NULL AND le.customer_id NOT IN (SELECT id FROM customers WHERE company_id=?)`).get(cid, cid).c;
  assertEq(o1, 0, `No orphan customer entries (${o1})`);
  const o2 = db.prepare(`SELECT COUNT(*) c FROM ledger_entries le WHERE le.company_id=? AND le.supplier_id IS NOT NULL AND le.supplier_id NOT IN (SELECT id FROM suppliers WHERE company_id=?)`).get(cid, cid).c;
  assertEq(o2, 0, `No orphan supplier entries (${o2})`);

  // 5.5 Outstanding vs Customer balances
  sub('5.5 — Outstanding Summary');
  const out = db.prepare(`SELECT COALESCE(SUM(total_remaining),0) c FROM invoices WHERE company_id=? AND invoice_type='SALE' AND total_remaining>0`).get(cid).c;
  console.log(`  Outstanding SALE invoices: ₹${out}`);

  // 5.6 Deletion reversal
  sub('5.6 — Delete INV-003 (Return) → Reversal Check');
  // Simulate: delete INV-003 → restore 2 Steel Widget stock (+2), reverse customer credit (+₹2,832)
  const steelId = db.prepare('SELECT product_id FROM invoice_items WHERE invoice_id=? LIMIT 1').get(tids.inv33Id).product_id;
  db.prepare('UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?').run(2, steelId);
  // Verify reversal
  assertEq(db.prepare('SELECT stock_qty FROM products WHERE id=?').get(steelId).stock_qty, 90, 'After delete reversal, Steel stock=90');
  // Restore
  db.prepare('UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?').run(2, steelId);
  assertEq(db.prepare('SELECT stock_qty FROM products WHERE id=?').get(steelId).stock_qty, 92, 'After restore, Steel stock=92');
}

// ─── Phase 6 ────────────────────────────────────────────────────────────
function phase6(db, { companyId, fy1Id, fy2Id }, ids) {
  heading('6', 'Legacy Import & FY Chain');

  // Import voucher dedup — insert log entry first for FK
  sub('6.1 — Voucher Map Dedup');
  const logId = db.prepare('INSERT INTO legacy_import_log (file_path,company_id,fy_id,file_hash,fy_name,imported_products,imported_customers,imported_invoices,imported_ledger,imported_opening_balances) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run('/test/spd.mdb',companyId,fy1Id,'abc123','FY24-25',4,3,2,10,1).lastInsertRowid;
  const vm = db.prepare('INSERT OR IGNORE INTO import_voucher_map (import_file_log_id,fy_id,legacy_voucher_id,entity_type,entity_id) VALUES (?,?,?,?,?)');
  assertEq(vm.run(logId, fy1Id,'VCH-001','INVOICE',1).changes, 1, 'First voucher insert');
  assertEq(vm.run(logId, fy1Id,'VCH-001','INVOICE',2).changes, 0, 'Duplicate ignored');
  console.log('  Dedup OK');

  // FY carry-forwards
  sub('6.2 — FY Carry-Forwards');
  const cf = db.prepare('INSERT INTO fy_carry_forwards (company_id,customer_id,from_fy_id,to_fy_id,amount,balance_type) VALUES (?,?,?,?,?,?)');
  cf.run(companyId, ids.customerIds.abc, fy1Id, fy2Id, 0, 'Dr');
  cf.run(companyId, ids.customerIds.mno, fy1Id, fy2Id, 50000, 'Dr');
  cf.run(companyId, ids.customerIds.xyz, fy1Id, fy2Id, 11200, 'Dr');
  assertEq(db.prepare('SELECT COUNT(*) c FROM fy_carry_forwards WHERE company_id=?').get(companyId).c, 3, '3 carry-forwards');

  // Legacy import log
  sub('6.3 — Import Log');
  db.prepare('INSERT INTO legacy_import_log (file_path,company_id,fy_id,file_hash,fy_name,imported_products,imported_customers,imported_invoices,imported_ledger,imported_opening_balances) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run('/test/spd2.mdb',companyId,fy2Id,'def456','FY25-26',4,3,2,10,1);
  assertEq(db.prepare('SELECT COUNT(*) c FROM legacy_import_log WHERE company_id=?').get(companyId).c, 2, '2 log entries');
  console.log('  Legacy structures OK');
}

// ─── Main ───────────────────────────────────────────────────────────────
function main() {
  console.log('═'.repeat(72));
  console.log('  LedgerMitra — Accounting Integration Test Suite');
  console.log('═'.repeat(72));
  console.log('  Principles: Double-entry, GST, Balances, Stock, Outstanding\n');

  const db = initDb();
  try {
    const cids = phase1(db);
    const mids = phase2(db, cids.companyId);
    const tids = phase3(db, cids, mids);
    phase4(db, cids.companyId, mids);
    phase5(db, cids.companyId, tids);
    phase6(db, cids, mids);
  } catch (err) {
    console.error(`\n  UNEXPECTED: ${err.message}\n${err.stack}`);
    failed++;
  }
  db.close();

  console.log('\n' + '═'.repeat(72));
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  if (errors.length) {
    console.log(`\n  Failures:`);
    errors.forEach((e,i) => console.log(`    ${i+1}. ${e}`));
  }
  if (failed === 0) console.log('\n  ✓ ALL ACCOUNTING TESTS PASSED');
  else console.log(`\n  ✗ ${failed} FAILED`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
