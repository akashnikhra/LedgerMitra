export interface Company {
  id: number;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  pan?: string;
  state?: string;
  created_at: string;
}

export interface FinancialYear {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  company_id?: number;
  created_at: string;
}

export interface Customer {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  state?: string;
  gstin?: string;
  opening_balance: number;
  opening_balance_type?: string;
  current_balance: number;
  company_id?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  state?: string;
  gstin?: string;
  opening_balance: number;
  opening_balance_type?: string;
  current_balance: number;
  company_id?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  category?: string;
  purchase_rate?: number;
  selling_rate: number;
  gst_rate?: number;
  hsn_code?: string;
  unit?: string;
  stock_qty: number;
  opening_stock: number;
  reorder_level?: number;
  company_id?: number;
}

export interface Invoice {
  id: number;
  invoice_no: string;
  invoice_type?: string;
  fy_id?: number;
  customer_id: number;
  supplier_id?: number;
  invoice_date: string;
  subtotal?: number;
  discount?: number;
  tax_amount?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  total_amount: number;
  total_remaining: number;
  company_id?: number;
  notes?: string;
  customer_name?: string;
  supplier_name?: string;
  created_at?: string;
}

export interface InvoiceItem {
  id: number;
  invoice_id: number;
  product_id?: number;
  product_name?: string;
  qty: number;
  rate: number;
  amount: number;
  gst_rate?: number;
  gst_amount?: number;
  discount_pct?: number;
  remarks?: string;
}

export interface PurchaseInvoice {
  id: number;
  invoice_no: string;
  fy_id?: number;
  supplier_id: number;
  invoice_date: string;
  subtotal?: number;
  discount?: number;
  tax_amount?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  total_amount: number;
  total_remaining: number;
  company_id?: number;
  notes?: string;
  supplier_name?: string;
  created_at?: string;
}

export interface LedgerEntry {
  id: number;
  entry_date: string;
  customer_id?: number;
  invoice_id?: number;
  receipt_id?: number;
  entry_type: string;
  debit?: number;
  credit?: number;
  narration?: string;
  fy_source_id?: number;
}

export interface MdbFileInfo {
  name: string;
  path: string;
  size: number;
  modifiedDate: string;
}

export interface MdbFullAnalysis {
  success: boolean;
  fileName: string;
  fileSize: number;
  tables: { name: string; rowCount: number; columns: string[]; sampleRows: any[] }[];
  companyName: string | null;
  dateRange: { min: string | null; max: string | null };
  suggestedFY: { name: string; startDate: string; endDate: string; valid: boolean; warnings: string[] };
  dataSummary: { products: number; customers: number; invoices: number; ledgerEntries: number };
  error?: string;
}

export interface MdbImportResult {
  success: boolean;
  imported: { products: number; customers: number; invoices: number; ledger: number; openingBalances: number };
  skipped: { products: number; customers: number; invoices: number; ledger: number; openingBalances: number };
  errors: { products: string[]; customers: string[]; invoices: string[]; ledger: string[] };
  error?: string;
  fyResults?: Array<{
    fyName: string;
    fyId: number;
    imported: number;
    skipped: number;
  }>;
}

export interface ImportFileLog {
  id: number;
  file_path: string;
  file_hash: string;
  company_id: number;
  fy_id?: number;
  fy_name?: string;
  status: string;
  imported_products: number;
  imported_customers: number;
  imported_invoices: number;
  imported_ledger: number;
  imported_opening_balances: number;
  skipped_json?: string;
  completed_at: string;
}

export interface ImportVoucherMap {
  id: number;
  import_file_log_id: number;
  fy_id: number;
  legacy_voucher_id: string;
  entity_type: string;
  entity_id: number;
}

export interface FyCarryForward {
  id: number;
  company_id: number;
  customer_id: number;
  from_fy_id: number;
  to_fy_id: number;
  amount: number;
  balance_type: 'Dr' | 'Cr';
  source_ledger_entry_id?: number;
}

export interface DetectedFY {
  name: string;
  startDate: string;
  endDate: string;
  rowCount: number;
  dateRange: { min: string; max: string };
}

export interface MdbFileImportStatus {
  fileHash: string;
  filePath: string;
  existing: boolean;
  previouslyImportedFYs: Array<{
    fyName: string;
    fyId: number;
    invoiceCount: number;
    importDate: string;
  }>;
  detectedFYs: DetectedFY[];
}

export interface FyCarryForwardTrace {
  customerId: number;
  customerName: string;
  currentBalance: number;
  chain: Array<{
    fyId: number;
    fyName: string;
    isOpening: boolean;
    amount: number;
    balanceType: 'Dr' | 'Cr';
    entries: Array<{
      entryType: string;
      entryDate: string;
      invoiceNo?: string;
      receiptNo?: string;
      debit?: number;
      credit?: number;
      narration?: string;
    }>;
  }>;
}

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

export interface LedgerEntryWithBalance extends LedgerEntry {
  balance?: number;
  customer_name?: string;
  invoice_no?: string;
  receipt_no?: string;
}

export interface LedgerCustomerResult {
  entries: LedgerEntryWithBalance[];
  openingBalance: number;
  closingBalance: number;
}

export interface LedgerYearResult {
  entries: LedgerEntryWithBalance[];
  summary: { totalDebit: number; totalCredit: number; netBalance: number; openingBalance: number };
}

export interface DashboardInsights {
  kpi: {
    products: number;
    customers: number;
    invoices: number;
    receivables: number;
    payables: number;
    supplierPayables: number;
    totalSales: number;
    totalReceipts: number;
  };
  monthlyRevenue: { month: string; revenue: number; count: number }[];
  topDebtors: { id: number; name: string; balance: number }[];
  invoiceAging: { bucket: string; amount: number; count: number }[];
  lowStock: { id: number; name: string; sku: string; stockQty: number; reorderLevel: number }[];
  recentActivity: { type: string; ref: string; date: string; amount: number; customerName?: string; id?: number }[];
}

export interface PrintTemplateData {
  type: 'invoice' | 'receipt' | 'ledger';
  data: Record<string, unknown>;
}

