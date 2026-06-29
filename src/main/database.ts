import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import bcrypt from 'bcryptjs';

let db: Database.Database | null = null;

const SALT_ROUNDS = 10;

export function getDatabasePath(): string {
  const dataDir = process.env.LEDGERMITRA_DATA_DIR || join(process.cwd(), 'data');
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  return join(dataDir, 'ledgermitra.db');
}

export async function initializeDatabase(dbPath?: string): Promise<void> {
  const path = dbPath || getDatabasePath();
  const schemaPath = join(__dirname, '../../database/schema.sql');
  if (!existsSync(schemaPath)) {
    throw new Error(`Schema not found: ${schemaPath}`);
  }

  db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(readFileSync(schemaPath, 'utf-8'));

  // Migration: Add product_name column to invoice_items if it doesn't exist
  try {
    const columns = db.prepare("PRAGMA table_info(invoice_items)").all() as Array<{ name: string }>;
    const hasProductName = columns.some((col) => col.name === 'product_name');
    if (!hasProductName) {
      db.exec('ALTER TABLE invoice_items ADD COLUMN product_name VARCHAR(200)');
      // Backfill existing records with product names from products table
      db.exec(`
        UPDATE invoice_items
        SET product_name = (
          SELECT p.name FROM products p WHERE p.id = invoice_items.product_id
        )
        WHERE product_id IS NOT NULL AND product_name IS NULL
      `);
      console.log('[Migration] Added product_name column and backfilled existing records');
    }
  } catch (e) {
    console.error('Migration error:', e);
  }

  // Migration: Add opening_balance_type to customers
  try {
    const custCols = db.prepare("PRAGMA table_info(customers)").all() as Array<{ name: string }>;
    const hasObType = custCols.some((col) => col.name === 'opening_balance_type');
    if (!hasObType) {
      db.exec("ALTER TABLE customers ADD COLUMN opening_balance_type VARCHAR(2) DEFAULT 'Dr'");
      console.log('[Migration] Added opening_balance_type to customers');
    }
  } catch (e) {
    console.error('Migration error:', e);
  }

  // Migration: Add invoice_type to invoices
  try {
    const invCols = db.prepare("PRAGMA table_info(invoices)").all() as Array<{ name: string }>;
    const hasInvType = invCols.some((col) => col.name === 'invoice_type');
    if (!hasInvType) {
      db.exec("ALTER TABLE invoices ADD COLUMN invoice_type VARCHAR(20) DEFAULT 'SALE'");
      console.log('[Migration] Added invoice_type to invoices');
    }
  } catch (e) {
    console.error('Migration error:', e);
  }

  // Migration: Add supplier_id to invoices
  try {
    const invCols2 = db.prepare("PRAGMA table_info(invoices)").all() as Array<{ name: string }>;
    const hasSupId = invCols2.some((col) => col.name === 'supplier_id');
    if (!hasSupId) {
      db.exec('ALTER TABLE invoices ADD COLUMN supplier_id INTEGER REFERENCES suppliers(id)');
      console.log('[Migration] Added supplier_id to invoices');
    }
  } catch (e) {
    console.error('Migration error:', e);
  }

  // Migration: Add receipt_id to ledger_entries
  try {
    const ledgerCols = db.prepare("PRAGMA table_info(ledger_entries)").all() as Array<{ name: string }>;
    if (!ledgerCols.some((col) => col.name === 'receipt_id')) {
      db.exec('ALTER TABLE ledger_entries ADD COLUMN receipt_id INTEGER REFERENCES receipts(id)');
      console.log('[Migration] Added receipt_id to ledger_entries');
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

  // Migration: Initialize default settings for receipt prefixes
  try {
    const existingKeys = db.prepare("SELECT key FROM settings").all() as Array<{ key: string }>;
    const keySet = new Set(existingKeys.map(k => k.key));
    if (!keySet.has('receipt_prefix')) {
      db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run('receipt_prefix', 'REC');
    }
    console.log('[Migration] Initialized default print settings');
  } catch (e) {
    console.error('Migration error:', e);
  }

  // Migration: Add columns to legacy_import_log
  try {
    const logCols = db.prepare("PRAGMA table_info(legacy_import_log)").all() as Array<{ name: string }>;
    const logColNames = new Set(logCols.map(c => c.name));
    if (!logColNames.has('file_hash')) {
      db.exec("ALTER TABLE legacy_import_log ADD COLUMN file_hash TEXT");
    }
    if (!logColNames.has('fy_name')) {
      db.exec("ALTER TABLE legacy_import_log ADD COLUMN fy_name TEXT");
    }
    if (!logColNames.has('status')) {
      db.exec("ALTER TABLE legacy_import_log ADD COLUMN status TEXT DEFAULT 'completed'");
    }
    if (!logColNames.has('imported_opening_balances')) {
      db.exec("ALTER TABLE legacy_import_log ADD COLUMN imported_opening_balances INTEGER DEFAULT 0");
    }
    console.log('[Migration] Added columns to legacy_import_log');
  } catch (e) {
    console.error('Migration error:', e);
  }

  // Migration: Add fy_source_id to ledger_entries
  try {
    const leCols = db.prepare("PRAGMA table_info(ledger_entries)").all() as Array<{ name: string }>;
    if (!leCols.some(c => c.name === 'fy_source_id')) {
      db.exec("ALTER TABLE ledger_entries ADD COLUMN fy_source_id INTEGER REFERENCES financial_years(id)");
      console.log('[Migration] Added fy_source_id to ledger_entries');
    }
  } catch (e) {
    console.error('Migration error:', e);
  }

  // Migration: Create import_voucher_map table
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS import_voucher_map (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        import_file_log_id INTEGER NOT NULL,
        fy_id INTEGER NOT NULL,
        legacy_voucher_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        UNIQUE(fy_id, legacy_voucher_id, entity_type),
        FOREIGN KEY (import_file_log_id) REFERENCES legacy_import_log(id)
      )
    `);
    console.log('[Migration] Created import_voucher_map table');
  } catch (e) {
    console.error('Migration error:', e);
  }

  // Migration: Create fy_carry_forwards table
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS fy_carry_forwards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        customer_id INTEGER NOT NULL,
        from_fy_id INTEGER NOT NULL,
        to_fy_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        balance_type TEXT NOT NULL CHECK(balance_type IN ('Dr', 'Cr')),
        source_ledger_entry_id INTEGER REFERENCES ledger_entries(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[Migration] Created fy_carry_forwards table');
  } catch (e) {
    console.error('Migration error:', e);
  }

  // Migration: Recalculate customer.current_balance from ledger entries
  try {
    db.exec(`
      UPDATE customers SET current_balance = (
        CASE WHEN c.opening_balance_type = 'Cr' THEN -c.opening_balance ELSE c.opening_balance END
        + COALESCE((
          SELECT SUM(COALESCE(debit, 0)) - SUM(COALESCE(credit, 0))
          FROM ledger_entries
          WHERE customer_id = c.id AND company_id = c.company_id AND entry_type != 'OPENING_BALANCE'
        ), 0)
      )
      FROM customers c
      WHERE customers.id = c.id
    `);
    console.log('[Migration] Recalculated customer.current_balance from ledger entries');
  } catch (e) {
    console.error('Migration error (recalculate customer balances):', e);
  }

  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number };
  if (userCount.c === 0) {
    const hash = bcrypt.hashSync('admin123', SALT_ROUNDS);
    db.prepare(
      `INSERT INTO users (username, password_hash, password_hint) VALUES ('admin', ?, 'Default: admin123')`
    ).run(hash);
  }

  // Migration: Add discount_pct and remarks columns to invoice_items
  try {
    const iiCols = db.prepare("PRAGMA table_info(invoice_items)").all() as Array<{ name: string }>;
    const iiColNames = new Set(iiCols.map(c => c.name));
    if (!iiColNames.has('discount_pct')) {
      db.exec("ALTER TABLE invoice_items ADD COLUMN discount_pct DECIMAL(5, 2) DEFAULT 0");
      console.log('[Migration] Added discount_pct to invoice_items');
    }
    if (!iiColNames.has('remarks')) {
      db.exec("ALTER TABLE invoice_items ADD COLUMN remarks TEXT");
      console.log('[Migration] Added remarks to invoice_items');
    }
  } catch (e) {
    console.error('Migration error:', e);
  }

  // Migration: Add discount_pct and remarks columns to purchase_invoice_items
  try {
    const piiCols = db.prepare("PRAGMA table_info(purchase_invoice_items)").all() as Array<{ name: string }>;
    const piiColNames = new Set(piiCols.map(c => c.name));
    if (!piiColNames.has('discount_pct')) {
      db.exec("ALTER TABLE purchase_invoice_items ADD COLUMN discount_pct DECIMAL(5, 2) DEFAULT 0");
      console.log('[Migration] Added discount_pct to purchase_invoice_items');
    }
    if (!piiColNames.has('remarks')) {
      db.exec("ALTER TABLE purchase_invoice_items ADD COLUMN remarks TEXT");
      console.log('[Migration] Added remarks to purchase_invoice_items');
    }
  } catch (e) {
    console.error('Migration error:', e);
  }

  // Migration: Recalculate invoice amounts to apply discount_pct
  // Fixes legacy imports where D% was stored but not applied to amounts
  try {
    const invoices = db.prepare(`SELECT id FROM invoices WHERE id IN (
      SELECT DISTINCT invoice_id FROM invoice_items WHERE discount_pct > 0
    )`).all() as Array<{ id: number }>;
    for (const inv of invoices) {
      const items = db.prepare(
        'SELECT id, qty, rate, gst_rate, discount_pct FROM invoice_items WHERE invoice_id = ?'
      ).all(inv.id) as Array<{ id: number; qty: number; rate: number; gst_rate: number; discount_pct: number }>;
      let subtotal = 0;
      let taxAmount = 0;
      let totalDiscount = 0;
      for (const item of items) {
        const lineAmt = item.qty * item.rate;
        const discountAmt = item.discount_pct ? (lineAmt * item.discount_pct) / 100 : 0;
        const amt = lineAmt - discountAmt;
        subtotal += amt;
        totalDiscount += discountAmt;
        const gst = item.gst_rate ? (amt * item.gst_rate) / 100 : 0;
        taxAmount += gst;
        db.prepare('UPDATE invoice_items SET amount = ?, gst_amount = ? WHERE id = ?')
          .run(amt, gst, item.id);
      }
      const total = subtotal + taxAmount;
      const oldInvoice = db.prepare('SELECT total_amount, customer_id FROM invoices WHERE id = ?').get(inv.id) as { total_amount: number; customer_id: number } | undefined;
      const oldTotal = oldInvoice?.total_amount || total;
      const totalDiff = total - oldTotal;
      db.prepare(`UPDATE invoices SET subtotal = ?, discount = ?, tax_amount = ?, total_amount = ?, total_remaining = MAX(0, total_remaining + ?) WHERE id = ?`)
        .run(subtotal, totalDiscount, taxAmount, total, totalDiff, inv.id);
      if (totalDiff !== 0 && oldInvoice?.customer_id) {
        db.prepare(`UPDATE customers SET current_balance = current_balance + ? WHERE id = ?`)
          .run(totalDiff, oldInvoice.customer_id);
      }
    }
    if (invoices.length > 0) {
      console.log(`[Migration] Recalculated amounts for ${invoices.length} invoices with D%`);
    }
  } catch (e) {
    console.error('Migration error (recalc invoice amounts):', e);
  }

  // Migration: Delete empty rows from invoice_items (no product, no amount)
  try {
    const deleted = db.prepare(
      `DELETE FROM invoice_items WHERE product_id IS NULL AND product_name IS NULL AND (rate = 0 OR amount = 0)`
    ).run();
    if (deleted.changes > 0) {
      console.log(`[Migration] Deleted ${deleted.changes} empty invoice_item rows`);
    }
  } catch (e) {
    console.error('Migration error (cleanup empty rows):', e);
  }

  // Migration: Add discount column to purchase_invoices if missing
  try {
    const piCols = db.prepare("PRAGMA table_info(purchase_invoices)").all() as Array<{ name: string }>;
    const piColNames = new Set(piCols.map(c => c.name));
    if (!piColNames.has('discount')) {
      db.exec("ALTER TABLE purchase_invoices ADD COLUMN discount DECIMAL(15, 2) DEFAULT 0");
      console.log('[Migration] Added discount to purchase_invoices');
    }
  } catch (e) {
    console.error('Migration error:', e);
  }

  // Migration: Recalculate purchase invoice amounts to apply discount_pct
  try {
    const pInvoices = db.prepare(`SELECT id FROM purchase_invoices WHERE id IN (
      SELECT DISTINCT invoice_id FROM purchase_invoice_items WHERE discount_pct > 0
    )`).all() as Array<{ id: number }>;
    for (const inv of pInvoices) {
      const items = db.prepare(
        'SELECT id, qty, rate, gst_rate, discount_pct FROM purchase_invoice_items WHERE invoice_id = ?'
      ).all(inv.id) as Array<{ id: number; qty: number; rate: number; gst_rate: number; discount_pct: number }>;
      let subtotal = 0;
      let taxAmount = 0;
      let totalDiscount = 0;
      for (const item of items) {
        const lineAmt = item.qty * item.rate;
        const discountAmt = item.discount_pct ? (lineAmt * item.discount_pct) / 100 : 0;
        const amt = lineAmt - discountAmt;
        subtotal += amt;
        totalDiscount += discountAmt;
        const gst = item.gst_rate ? (amt * item.gst_rate) / 100 : 0;
        taxAmount += gst;
        db.prepare('UPDATE purchase_invoice_items SET amount = ?, gst_amount = ? WHERE id = ?')
          .run(amt, gst, item.id);
      }
      const total = subtotal + taxAmount;
      const oldInv = db.prepare('SELECT total_amount, supplier_id FROM purchase_invoices WHERE id = ?').get(inv.id) as { total_amount: number; supplier_id: number } | undefined;
      const oldTotal = oldInv?.total_amount || total;
      const totalDiff = total - oldTotal;
      db.prepare(`UPDATE purchase_invoices SET subtotal = ?, discount = ?, tax_amount = ?, total_amount = ?, total_remaining = MAX(0, total_remaining + ?) WHERE id = ?`)
        .run(subtotal, totalDiscount, taxAmount, total, totalDiff, inv.id);
    }
    if (pInvoices.length > 0) {
      console.log(`[Migration] Recalculated amounts for ${pInvoices.length} purchase invoices with D%`);
    }
  } catch (e) {
    console.error('Migration error (recalc purchase invoice amounts):', e);
  }

  // Migration: Delete empty rows from purchase_invoice_items (no product, no amount)
  try {
    const deleted = db.prepare(
      `DELETE FROM purchase_invoice_items WHERE product_id IS NULL AND product_name IS NULL AND (rate = 0 OR amount = 0)`
    ).run();
    if (deleted.changes > 0) {
      console.log(`[Migration] Deleted ${deleted.changes} empty purchase_invoice_item rows`);
    }
  } catch (e) {
    console.error('Migration error (cleanup empty purchase rows):', e);
  }

  // Migration: Create licenses table
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS licenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL,
        hardware_id TEXT,
        customer_name TEXT,
        license_type TEXT NOT NULL DEFAULT 'perpetual',
        activated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[Migration] Created licenses table');
  } catch (e) {
    console.error('Migration error:', e);
  }

  // Migration: Create license_activations table
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS license_activations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        license_key TEXT NOT NULL,
        hardware_id TEXT NOT NULL,
        activated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(license_key, hardware_id)
      )
    `);
    console.log('[Migration] Created license_activations table');
  } catch (e) {
    console.error('Migration error:', e);
  }
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function getDatabase(): Database.Database {
  if (!db) throw new Error('Database not initialized');
  return db;
}

export function queryAll<T>(sql: string, params: unknown[] = []): T[] {
  return getDatabase().prepare(sql).all(...params) as T[];
}

export function queryOne<T>(sql: string, params: unknown[] = []): T | undefined {
  return getDatabase().prepare(sql).get(...params) as T | undefined;
}

export function executeWrite(sql: string, params: unknown[] = []): Database.RunResult {
  return getDatabase().prepare(sql).run(...params);
}
