-- LedgerMitra - SQLite schema (legacy-import ready)

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  password_hint TEXT,
  failed_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS company (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name VARCHAR(200) NOT NULL,
  address TEXT,
  phone VARCHAR(20),
  email VARCHAR(100),
  gstin VARCHAR(20),
  pan VARCHAR(20),
  state VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS financial_years (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name VARCHAR(10) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT 1,
  company_id INTEGER REFERENCES company(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(name, company_id)
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(100),
  address TEXT,
  state VARCHAR(50),
  gstin VARCHAR(20),
  opening_balance DECIMAL(15, 2) DEFAULT 0,
  opening_balance_type VARCHAR(2) DEFAULT 'Dr',
  current_balance DECIMAL(15, 2) DEFAULT 0,
  company_id INTEGER REFERENCES company(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku VARCHAR(50) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  purchase_rate DECIMAL(15, 2),
  selling_rate DECIMAL(15, 2) NOT NULL,
  gst_rate DECIMAL(5, 2),
  hsn_code VARCHAR(20),
  unit VARCHAR(50) DEFAULT 'Nos',
  stock_qty INTEGER DEFAULT 0,
  opening_stock INTEGER DEFAULT 0,
  reorder_level INTEGER,
  company_id INTEGER REFERENCES company(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(sku, company_id)
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no VARCHAR(50) NOT NULL,
  invoice_type VARCHAR(20) DEFAULT 'SALE',
  fy_id INTEGER REFERENCES financial_years(id),
  customer_id INTEGER REFERENCES customers(id),
  supplier_id INTEGER REFERENCES suppliers(id),
  invoice_date DATE NOT NULL,
  subtotal DECIMAL(15, 2) DEFAULT 0,
  discount DECIMAL(15, 2) DEFAULT 0,
  tax_amount DECIMAL(15, 2) DEFAULT 0,
  cgst_amount DECIMAL(15, 2) DEFAULT 0,
  sgst_amount DECIMAL(15, 2) DEFAULT 0,
  igst_amount DECIMAL(15, 2) DEFAULT 0,
  total_amount DECIMAL(15, 2) DEFAULT 0,
  total_remaining DECIMAL(15, 2) DEFAULT 0,
  company_id INTEGER REFERENCES company(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(invoice_no, company_id)
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  product_name VARCHAR(200),
  qty INTEGER NOT NULL,
  rate DECIMAL(15, 2) NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  gst_rate DECIMAL(5, 2),
  gst_amount DECIMAL(15, 2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_date DATE NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  invoice_id INTEGER REFERENCES invoices(id),
  entry_type VARCHAR(20) NOT NULL,
  debit DECIMAL(15, 2),
  credit DECIMAL(15, 2),
  balance DECIMAL(15, 2),
  company_id INTEGER REFERENCES company(id),
  narration TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(100),
  address TEXT,
  state VARCHAR(50),
  gstin VARCHAR(20),
  opening_balance DECIMAL(15, 2) DEFAULT 0,
  opening_balance_type VARCHAR(2) DEFAULT 'Cr',
  current_balance DECIMAL(15, 2) DEFAULT 0,
  company_id INTEGER REFERENCES company(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no VARCHAR(50) NOT NULL,
  fy_id INTEGER REFERENCES financial_years(id),
  supplier_id INTEGER REFERENCES suppliers(id),
  invoice_date DATE NOT NULL,
  subtotal DECIMAL(15, 2) DEFAULT 0,
  discount DECIMAL(15, 2) DEFAULT 0,
  tax_amount DECIMAL(15, 2) DEFAULT 0,
  cgst_amount DECIMAL(15, 2) DEFAULT 0,
  sgst_amount DECIMAL(15, 2) DEFAULT 0,
  igst_amount DECIMAL(15, 2) DEFAULT 0,
  total_amount DECIMAL(15, 2) DEFAULT 0,
  total_remaining DECIMAL(15, 2) DEFAULT 0,
  company_id INTEGER REFERENCES company(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(invoice_no, company_id)
);

CREATE TABLE IF NOT EXISTS purchase_invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  product_name VARCHAR(200),
  qty INTEGER NOT NULL,
  rate DECIMAL(15, 2) NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  gst_rate DECIMAL(5, 2),
  gst_amount DECIMAL(15, 2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS legacy_import_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  file_hash TEXT,
  company_id INTEGER,
  fy_id INTEGER,
  fy_name TEXT,
  status TEXT DEFAULT 'completed',
  imported_products INTEGER DEFAULT 0,
  imported_customers INTEGER DEFAULT 0,
  imported_invoices INTEGER DEFAULT 0,
  imported_ledger INTEGER DEFAULT 0,
  imported_opening_balances INTEGER DEFAULT 0,
  skipped_json TEXT,
  completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS import_voucher_map (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_file_log_id INTEGER NOT NULL,
  fy_id INTEGER NOT NULL,
  legacy_voucher_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  UNIQUE(fy_id, legacy_voucher_id, entity_type),
  FOREIGN KEY (import_file_log_id) REFERENCES legacy_import_log(id)
);

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
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key VARCHAR(100) UNIQUE NOT NULL,
  value TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
);

CREATE TABLE IF NOT EXISTS receipt_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id INTEGER NOT NULL REFERENCES receipts(id),
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  allocated_amount DECIMAL(15,2) NOT NULL,
  UNIQUE(receipt_id, invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_products_company ON products(company_id);
CREATE INDEX IF NOT EXISTS idx_customers_company ON customers(company_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_company ON suppliers(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_fy ON invoices(fy_id);
CREATE INDEX IF NOT EXISTS idx_invoices_type ON invoices(invoice_type);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_fy ON purchase_invoices(fy_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_supplier ON purchase_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_ledger_customer ON ledger_entries(customer_id);
CREATE INDEX IF NOT EXISTS idx_ledger_date ON ledger_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_ledger_company ON ledger_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_ledger_company_customer ON ledger_entries(company_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_receipts_company ON receipts(company_id);
CREATE INDEX IF NOT EXISTS idx_receipt_allocations_receipt ON receipt_allocations(receipt_id);
CREATE INDEX IF NOT EXISTS idx_legacy_import_log_hash ON legacy_import_log(file_hash);
