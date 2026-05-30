import { ipcMain, BrowserWindow, dialog } from 'electron';
import { spawn } from 'child_process';
import { join } from 'path';
import { statSync, existsSync } from 'fs';
import { IPC_CHANNELS } from '@shared/constants';
import { login, logout, changePassword } from './auth';
import { getCurrentUser, getActiveFyId } from './session';
import { getAllCompanies, createCompany, getCompany } from './company';
import {
  getAllFinancialYears,
  createFinancialYear,
  setActiveFinancialYear,
  getActiveFinancialYear
} from './financial-year';
import { getAllCustomers, getCustomerById, createCustomer, updateCustomer, deleteCustomer } from './customer';
import { getAllSuppliers, getSupplierById, createSupplier, updateSupplier, deleteSupplier } from './supplier';
import { getAllProducts, getProductById, createProduct, updateProduct, deleteProduct } from './product';
import { getAllInvoices, getInvoiceById, getInvoiceWithItems, getInvoiceItems, createInvoice, updateInvoice, deleteInvoice } from './invoice';
import { getAllPurchaseInvoices, getPurchaseInvoiceById, getPurchaseInvoiceItems, createPurchaseInvoice, deletePurchaseInvoice } from './purchase-invoice';
import { getLedgerEntries, addPaymentEntry, addPurchasePaymentEntry, getCustomerLedger, getYearLedger, getInvoiceLedger, getLedgerSummary } from './ledger';
import { setWorkspace, getActiveCompanyId } from './session';
import { queryAll, queryOne, executeWrite } from './database';
import * as receipt from './receipt';
import * as print from './print';
import * as ledger from './ledger';
import * as whatsapp from './whatsapp';
import {
  scanMdbFiles,
  getLegacyDataFolders,
  analyzeMdbFileFull,
  importFromMdb,
  createCompanyForImport,
  getCompaniesForImport,
  getOrCreateFYForImport,
  checkFileImportStatus,
  analyzeDetectedFYs,
  getCustomerBalanceTrace,
  listImportLogs,
  checkMergedDb,
  importFromMergedDb,
  MergedDbInfo
} from './mdb-import';
import { getDatabasePath, closeDatabase, initializeDatabase } from './database';
import { copyFileSync, existsSync } from 'fs';
import {
  verifyLicense,
  activateLicense,
  getLicenseStatus,
  isPremiumFeature,
  getPremiumFeatureList,
  resetActivations,
  deactivateLicense
} from './license';

export function setupIpcHandlers(_win: BrowserWindow | null): void {
  ipcMain.handle(IPC_CHANNELS['auth:login'], (_, { username, password }) =>
    login(username, password)
  );
  ipcMain.handle(IPC_CHANNELS['auth:logout'], () => {
    logout();
    return { success: true };
  });
  ipcMain.handle(IPC_CHANNELS['auth:get-user'], () => ({ username: getCurrentUser() }));
  ipcMain.handle(IPC_CHANNELS['auth:change-password'], (_, data) => {
    const username = getCurrentUser() || data.username || 'admin';
    return changePassword(username, data.currentPassword, data.newPassword);
  });

  ipcMain.handle(IPC_CHANNELS['company:list'], () => getAllCompanies());
  ipcMain.handle(IPC_CHANNELS['company:get'], (_, id: number) => getCompany(id));
  ipcMain.handle(IPC_CHANNELS['company:create'], (_, data) => {
    // Allow first company creation (setup), gate additional companies behind premium
    const existingCompanies = getAllCompanies();
    if (existingCompanies.length > 0 && !isPremiumFeature('multi_company')) {
      return { success: false, error: 'Multi-Company is a premium feature. Upgrade at Settings > License.' };
    }
    return createCompany(data);
  });

  ipcMain.handle(IPC_CHANNELS['fy:list'], (_, companyId: number) =>
    getAllFinancialYears(companyId)
  );
  ipcMain.handle(IPC_CHANNELS['fy:get-active'], (_, companyId: number) =>
    getActiveFinancialYear(companyId)
  );
  ipcMain.handle(IPC_CHANNELS['fy:create'], (_, data) =>
    createFinancialYear(data.name, data.start_date, data.end_date, data.company_id, true)
  );
  ipcMain.handle(IPC_CHANNELS['fy:set-active'], (_, { id, companyId }) => {
    setActiveFinancialYear(id, companyId);
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS['workspace:set'], (_, { companyId, fyId }) => {
    setWorkspace(companyId, fyId);
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS['customer:list'], () => getAllCustomers());
  ipcMain.handle(IPC_CHANNELS['customer:get'], (_, id: number) => getCustomerById(id));
  ipcMain.handle(IPC_CHANNELS['customer:create'], (_, data) => createCustomer(data));
  ipcMain.handle(IPC_CHANNELS['customer:update'], (_, { id, data }) => updateCustomer(id, data));
  ipcMain.handle(IPC_CHANNELS['customer:delete'], (_, id: number) => deleteCustomer(id));

  ipcMain.handle(IPC_CHANNELS['supplier:list'], () => getAllSuppliers());
  ipcMain.handle(IPC_CHANNELS['supplier:get'], (_, id: number) => getSupplierById(id));
  ipcMain.handle(IPC_CHANNELS['supplier:create'], (_, data) => createSupplier(data));
  ipcMain.handle(IPC_CHANNELS['supplier:update'], (_, { id, data }) => updateSupplier(id, data));
  ipcMain.handle(IPC_CHANNELS['supplier:delete'], (_, id: number) => deleteSupplier(id));

  ipcMain.handle(IPC_CHANNELS['product:list'], () => getAllProducts());
  ipcMain.handle(IPC_CHANNELS['product:create'], (_, data) => createProduct(data));
  ipcMain.handle(IPC_CHANNELS['product:get'], (_, id: number) => getProductById(id));
  ipcMain.handle(IPC_CHANNELS['product:update'], (_, { id, data }) => updateProduct(id, data));
  ipcMain.handle(IPC_CHANNELS['product:delete'], (_, id: number) => deleteProduct(id));

  ipcMain.handle(IPC_CHANNELS['invoice:list'], (_, { fyId, type }: { fyId?: number; type?: string } = {}) => getAllInvoices(fyId, type));
  ipcMain.handle(IPC_CHANNELS['invoice:get'], (_, id: number) => getInvoiceById(id));
  ipcMain.handle(IPC_CHANNELS['invoice:get-with-items'], (_, id: number) => getInvoiceWithItems(id));
  ipcMain.handle(IPC_CHANNELS['invoice:item:list'], (_, invoiceId: number) => getInvoiceItems(invoiceId));
  ipcMain.handle(IPC_CHANNELS['invoice:create'], (_, data) => createInvoice(data));
  ipcMain.handle(IPC_CHANNELS['invoice:update'], (_, { id, data }) => updateInvoice(id, data));
  ipcMain.handle(IPC_CHANNELS['invoice:delete'], (_, id: number) => deleteInvoice(id));

  ipcMain.handle(IPC_CHANNELS['purchase-invoice:list'], (_, fyId?: number) => getAllPurchaseInvoices(fyId));
  ipcMain.handle(IPC_CHANNELS['purchase-invoice:get'], (_, id: number) => getPurchaseInvoiceById(id));
  ipcMain.handle(IPC_CHANNELS['purchase-invoice:create'], (_, data) => createPurchaseInvoice(data));
  ipcMain.handle(IPC_CHANNELS['purchase-invoice:delete'], (_, id: number) => deletePurchaseInvoice(id));
  ipcMain.handle(IPC_CHANNELS['purchase-invoice:item:list'], (_, invoiceId: number) => getPurchaseInvoiceItems(invoiceId));

  ipcMain.handle(IPC_CHANNELS['ledger:list'], (_, customerId?: number) =>
    getLedgerEntries(customerId)
  );
  ipcMain.handle(IPC_CHANNELS['ledger:add-payment'], (_, data) =>
    addPaymentEntry(data.customer_id, data.amount, data.entry_date, data.narration, data.invoice_id)
  );
  ipcMain.handle(IPC_CHANNELS['ledger:add-purchase-payment'], (_, data) =>
    addPurchasePaymentEntry(data.supplier_id, data.amount, data.entry_date, data.narration, data.invoice_id)
  );

  ipcMain.handle(IPC_CHANNELS['mdb:list-files'], () => scanMdbFiles());
  ipcMain.handle(IPC_CHANNELS['mdb:legacy-paths'], () => getLegacyDataFolders());
  ipcMain.handle(IPC_CHANNELS['mdb:analyze'], (_, { filePath, password }) =>
    analyzeMdbFileFull(filePath, password)
  );
  ipcMain.handle(IPC_CHANNELS['mdb:import'], async (_, payload) => {
    const result = await importFromMdb(payload.filePath, payload.password, payload.options);
    if (result.success) {
      executeWrite(
        `INSERT INTO legacy_import_log (file_path, company_id, fy_id, imported_products, imported_customers, imported_invoices, imported_ledger, imported_opening_balances)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          payload.filePath,
          payload.options.companyId,
          payload.options.fyId,
          result.imported.products,
          result.imported.customers,
          result.imported.invoices,
          result.imported.ledger,
          result.imported.openingBalances || 0
        ]
      );
    }
    return result;
  });

  ipcMain.handle(IPC_CHANNELS['mdb:create-company'], (_, { name, gstin }) => createCompanyForImport(name, gstin));
  ipcMain.handle(IPC_CHANNELS['mdb:get-companies'], () => getCompaniesForImport());
  ipcMain.handle(IPC_CHANNELS['mdb:create-fy'], (_, data) =>
    getOrCreateFYForImport(data.fyName, data.startDate, data.endDate, data.companyId, {
      setActive: data.setActive,
      useExistingId: data.useExistingId
    })
  );
  ipcMain.handle(IPC_CHANNELS['mdb:list-fy'], (_, companyId: number) => getAllFinancialYears(companyId));

  ipcMain.handle(IPC_CHANNELS['dashboard:insights'], () => {
    const companyId = getActiveCompanyId();
    if (!companyId) {
      return { kpi: { products: 0, customers: 0, invoices: 0, receivables: 0, payables: 0, supplierPayables: 0, totalSales: 0, totalReceipts: 0 }, monthlyRevenue: [], topDebtors: [], invoiceAging: [], lowStock: [], recentActivity: [] };
    }

    const fyId = getActiveFyId();
    const fyParams = fyId ? [companyId, fyId] : [companyId];
    const fySql = fyId ? 'AND fy_id = ?' : '';

    const products = queryOne<{ c: number }>('SELECT COUNT(*) as c FROM products WHERE company_id = ?', [companyId])?.c ?? 0;
    const customers = queryOne<{ c: number }>('SELECT COUNT(*) as c FROM customers WHERE company_id = ?', [companyId])?.c ?? 0;
    const invoices = queryOne<{ c: number }>(`SELECT COUNT(*) as c FROM invoices WHERE company_id = ? ${fySql}`, fyParams)?.c ?? 0;
    const receivables = queryOne<{ t: number }>('SELECT COALESCE(SUM(current_balance), 0) as t FROM customers WHERE company_id = ? AND current_balance > 0', [companyId])?.t ?? 0;
    const payables = queryOne<{ t: number }>('SELECT COALESCE(SUM(ABS(current_balance)), 0) as t FROM customers WHERE company_id = ? AND current_balance < 0', [companyId])?.t ?? 0;
    const supplierPayables = queryOne<{ t: number }>('SELECT COALESCE(SUM(current_balance), 0) as t FROM suppliers WHERE company_id = ? AND current_balance > 0', [companyId])?.t ?? 0;
    const totalSales = queryOne<{ t: number }>(`SELECT COALESCE(SUM(total_amount), 0) as t FROM invoices WHERE company_id = ? ${fySql}`, fyParams)?.t ?? 0;
    const totalReceipts = queryOne<{ t: number }>(`SELECT COALESCE(SUM(amount), 0) as t FROM receipts WHERE company_id = ? ${fySql}`, fyParams)?.t ?? 0;

    const monthlyRevenue = queryAll<{ month: string; revenue: number; count: number }>(
      `SELECT strftime('%Y-%m', invoice_date) as month, SUM(total_amount) as revenue, COUNT(*) as count
       FROM invoices WHERE company_id = ? AND invoice_type = 'SALE' ${fySql}
       GROUP BY month ORDER BY month DESC LIMIT 6`,
      fyParams
    ).reverse();

    const topDebtors = queryAll<{ id: number; name: string; balance: number }>(
      'SELECT id, name, current_balance as balance FROM customers WHERE company_id = ? AND current_balance > 0 ORDER BY current_balance DESC LIMIT 5',
      [companyId]
    );

    const invoiceAging = queryAll<{ bucket: string; amount: number; count: number }>(
      `SELECT
        CASE
          WHEN julianday('now') - julianday(invoice_date) <= 30 THEN '0-30'
          WHEN julianday('now') - julianday(invoice_date) <= 60 THEN '31-60'
          WHEN julianday('now') - julianday(invoice_date) <= 90 THEN '61-90'
          ELSE '90+'
        END as bucket,
        COALESCE(SUM(total_remaining), 0) as amount,
        COUNT(*) as count
       FROM invoices
       WHERE company_id = ? AND total_remaining > 0 AND invoice_type = 'SALE' ${fySql}
       GROUP BY bucket ORDER BY bucket`,
      fyParams
    );

    const lowStock = queryAll<{ id: number; name: string; sku: string; stockQty: number; reorderLevel: number }>(
      `SELECT id, name, sku, stock_qty as stockQty, reorder_level as reorderLevel
       FROM products WHERE company_id = ? AND reorder_level IS NOT NULL AND stock_qty <= reorder_level
       ORDER BY stock_qty ASC LIMIT 5`,
      [companyId]
    );

    const recentParams = fyId ? [companyId, fyId, companyId, fyId] : [companyId, companyId];
    const recentActivity = queryAll<{ type: string; ref: string; date: string; amount: number; customerName?: string; id?: number }>(
      `SELECT 'invoice' as type, invoice_no as ref, invoice_date as date, total_amount as amount, c.name as customerName, i.id
       FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id WHERE i.company_id = ? ${fySql}
       UNION ALL
       SELECT 'receipt' as type, receipt_no as ref, receipt_date as date, amount, c.name as customerName, r.id
       FROM receipts r LEFT JOIN customers c ON c.id = r.customer_id WHERE r.company_id = ? ${fySql}
       ORDER BY date DESC LIMIT 8`,
      recentParams
    );

    return {
      kpi: { products, customers, invoices, receivables, payables, supplierPayables, totalSales, totalReceipts },
      monthlyRevenue, topDebtors, invoiceAging, lowStock, recentActivity
    };
  });

  // Receipts
  ipcMain.handle(IPC_CHANNELS['receipt:list'], (_e, filters) => receipt.listReceipts(filters));
  ipcMain.handle(IPC_CHANNELS['receipt:get'], (_e, id) => receipt.getReceipt(id));
  ipcMain.handle(IPC_CHANNELS['receipt:create'], (_e, data) => receipt.createReceipt(data));
  ipcMain.handle(IPC_CHANNELS['receipt:delete'], (_e, id) => receipt.deleteReceipt(id));
  ipcMain.handle(IPC_CHANNELS['receipt:outstanding'], (_e, customerId) => receipt.getOutstandingInvoices(customerId));
  ipcMain.handle(IPC_CHANNELS['receipt:generate-no'], (_e, date) => receipt.generateReceiptNo(date));
  ipcMain.handle(IPC_CHANNELS['receipt:auto-allocate'], (_e, { customerId, amount }) => receipt.autoAllocate(customerId, amount));

  // Ledger (extended)
  ipcMain.handle(IPC_CHANNELS['ledger:customer'], (_e, { customerId, dateFrom, dateTo }) => ledger.getCustomerLedger(customerId, dateFrom, dateTo));
  ipcMain.handle(IPC_CHANNELS['ledger:year'], (_e, { fyId, customerId, entryType }) => ledger.getYearLedger(fyId, customerId, entryType));
  ipcMain.handle(IPC_CHANNELS['ledger:by-invoice'], (_e, invoiceId) => ledger.getInvoiceLedger(invoiceId));
  ipcMain.handle(IPC_CHANNELS['ledger:summary'], (_e, fyId) => ledger.getLedgerSummary(fyId));

  // Print (premium feature)
  ipcMain.handle(IPC_CHANNELS['print:invoice'], (_e, invoiceId: number) => {
    if (!isPremiumFeature('print_pdf')) return '';
    const invoice = getInvoiceById(invoiceId);
    if (!invoice) return '';
    const items = getInvoiceItems(invoiceId);
    const company = print.getCompanyInfo();
    const customer = getCustomerById(invoice.customer_id);
    const payments = receipt.listReceipts({ invoiceId });
    const amountPaid = payments.reduce((sum: number, r: { amount: number }) => sum + r.amount, 0);
    const isSale = invoice.invoice_type === 'SALE';
    const previousOutstanding = isSale
      ? (customer?.current_balance || 0) - invoice.total_amount
      : (customer?.current_balance || 0) + invoice.total_amount;
    const currentOutstanding = customer?.current_balance || 0;
    const paymentSummary = { amountPaid, pendingAmount: invoice.total_amount - amountPaid, previousOutstanding, currentOutstanding };
    return print.renderInvoiceTemplate({ invoice, items, company, customer, paymentSummary });
  });
  ipcMain.handle(IPC_CHANNELS['print:receipt'], (_e, receiptId: number) => {
    if (!isPremiumFeature('print_pdf')) return '';
    const r = receipt.getReceipt(receiptId);
    if (!r) return '';
    const company = print.getCompanyInfo();
    const customer = getCustomerById(r.receipt.customer_id);
    return print.renderReceiptTemplate({ receipt: r.receipt, allocations: r.allocations, company, customer });
  });
  ipcMain.handle(IPC_CHANNELS['print:ledger'], (_e, data: { customerId?: number; fyId?: number; entries?: unknown[]; summary?: unknown }) => {
    if (!isPremiumFeature('print_pdf')) return '';
    const company = print.getCompanyInfo();
    const fy = data.fyId ? queryOne('SELECT * FROM financial_years WHERE id = ?', [data.fyId]) : null;
    const customer = data.customerId ? getCustomerById(data.customerId) : null;
    const summary = data.summary as { openingBalance?: number; closingBalance?: number; totalDebit?: number; totalCredit?: number } | undefined;
    return print.renderLedgerTemplate({
      entries: data.entries || [],
      company,
      financialYear: fy,
      customer,
      openingBalance: summary?.openingBalance || 0,
      closingBalance: summary?.closingBalance || 0,
      summary
    });
  });
  ipcMain.handle(IPC_CHANNELS['print:save-pdf-dialog'], async (_e, { html, defaultName }) => {
    if (!isPremiumFeature('print_pdf')) return { success: false, error: 'Premium feature. Upgrade at Settings > License.' };
    const { dialog } = await import('electron');
    const result = await dialog.showSaveDialog({
      title: 'Save PDF',
      defaultPath: defaultName || 'document.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (result.canceled || !result.filePath) return { success: false, path: '' };
    const pdf = await print.generatePdf(html);
    print.savePdf(pdf, result.filePath);
    return { success: true, path: result.filePath };
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

  // License
  ipcMain.handle(IPC_CHANNELS['license:verify'], (_, key: string) => verifyLicense(key));
  ipcMain.handle(IPC_CHANNELS['license:activate'], (_, key: string) => activateLicense(key));
  ipcMain.handle(IPC_CHANNELS['license:status'], () => getLicenseStatus());
  ipcMain.handle(IPC_CHANNELS['license:trial-start'], () => getLicenseStatus());
  ipcMain.handle(IPC_CHANNELS['license:features'], () => getPremiumFeatureList());
  ipcMain.handle(IPC_CHANNELS['license:reset-activations'], () => resetActivations());
  ipcMain.handle(IPC_CHANNELS['license:deactivate'], () => deactivateLicense());
  ipcMain.handle(IPC_CHANNELS['feature:check'], (_, feature: string) => ({
    available: isPremiumFeature(feature)
  }));

  // Backup: Export database to user-chosen location (premium feature)
  ipcMain.handle(IPC_CHANNELS['backup:export'], async () => {
    if (!isPremiumFeature('backup')) return { success: false, error: 'Premium feature. Upgrade at Settings > License.' };
    const result = await dialog.showSaveDialog({
      title: 'Export Database Backup',
      defaultPath: `ledgermitra-backup-${new Date().toISOString().split('T')[0]}.db`,
      filters: [{ name: 'Database', extensions: ['db'] }]
    });
    if (result.canceled || !result.filePath) return { success: false, path: '' };
    try {
      const dbPath = getDatabasePath();
      copyFileSync(dbPath, result.filePath);
      return { success: true, path: result.filePath };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  });

  // Backup: Import database from backup file (requires restart, premium feature)
  ipcMain.handle(IPC_CHANNELS['backup:import'], async () => {
    if (!isPremiumFeature('backup')) return { success: false, error: 'Premium feature. Upgrade at Settings > License.' };
    const result = await dialog.showOpenDialog({
      title: 'Import Database Backup',
      filters: [{ name: 'Database', extensions: ['db'] }],
      properties: ['openFile']
    });
    if (result.canceled || result.filePaths.length === 0) return { success: false, path: '' };
    const backupPath = result.filePaths[0];
    if (!existsSync(backupPath)) return { success: false, error: 'Backup file not found' };
    try {
      const dbPath = getDatabasePath();
      // Close existing database connection before overwriting the file
      closeDatabase();
      // Create a backup of current database before overwriting
      const currentBackup = `${dbPath}.pre-restore-${Date.now()}.bak`;
      if (existsSync(dbPath)) copyFileSync(dbPath, currentBackup);
      // Copy backup to database path
      copyFileSync(backupPath, dbPath);
      // Re-initialize database connection from the restored file
      await initializeDatabase(dbPath);
      return { success: true, path: dbPath, requiresRestart: true };
    } catch (e) {
      // Try to recover database connection on failure
      try { await initializeDatabase(); } catch (_) { /* best effort */ }
      return { success: false, error: (e as Error).message };
    }
  });

  // WhatsApp (premium feature)
  ipcMain.handle(IPC_CHANNELS['whatsapp:status'], () => {
    if (!isPremiumFeature('whatsapp')) return { status: 'premium_required', message: 'WhatsApp is a premium feature. Upgrade at Settings > License.' };
    return whatsapp.getWhatsAppStatus();
  });
  ipcMain.handle(IPC_CHANNELS['whatsapp:reconnect'], () => {
    if (!isPremiumFeature('whatsapp')) return { success: false, error: 'Premium feature. Upgrade at Settings > License.' };
    return whatsapp.reconnectWhatsApp();
  });
  ipcMain.handle(IPC_CHANNELS['whatsapp:disconnect'], () => {
    if (!isPremiumFeature('whatsapp')) return { success: false, error: 'Premium feature. Upgrade at Settings > License.' };
    return whatsapp.disconnectWhatsApp();
  });
  ipcMain.handle(IPC_CHANNELS['whatsapp:send'], (_, data) => {
    if (!isPremiumFeature('whatsapp')) return { success: false, error: 'Premium feature. Upgrade at Settings > License.' };
    return whatsapp.sendWhatsAppDocument(data);
  });

  // Multi-FY MDB Import (premium feature)
  ipcMain.handle(IPC_CHANNELS['mdb:check-import-status'], (_, { filePath }) => {
    if (!isPremiumFeature('legacy_import')) return { error: 'Premium feature. Upgrade at Settings > License.' };
    return checkFileImportStatus(filePath);
  });
  ipcMain.handle(IPC_CHANNELS['mdb:analyze-fys'], (_, { filePath, password }) => {
    if (!isPremiumFeature('legacy_import')) return { error: 'Premium feature. Upgrade at Settings > License.' };
    return analyzeDetectedFYs(filePath, password);
  });
  ipcMain.handle(IPC_CHANNELS['mdb:import-fy'], async (_, { filePath, password, companyId, fyName, fyStartDate, fyEndDate, options }) => {
    if (!isPremiumFeature('legacy_import')) return { success: false, error: 'Premium feature. Upgrade at Settings > License.' };
    return importFromMdb(filePath, password, {
      companyId,
      selectedFYs: [{ name: fyName, startDate: fyStartDate, endDate: fyEndDate, mode: options.mode }],
      importProducts: options.importProducts ?? true,
      importCustomers: options.importCustomers ?? true,
      importInvoices: options.importInvoices ?? true,
      importLedger: options.importLedger ?? true,
      importOpeningBalances: options.importOpeningBalances ?? true
    });
  });
  ipcMain.handle(IPC_CHANNELS['import:list-logs'], (_, { companyId }) => {
    if (!isPremiumFeature('legacy_import')) return [];
    return listImportLogs(companyId);
  });

  // Balance Trace
  ipcMain.handle(IPC_CHANNELS['trace:customer-balance'], (_, { customerId, companyId }) =>
    getCustomerBalanceTrace(customerId, companyId)
  );
  ipcMain.handle(IPC_CHANNELS['trace:fy-chain'], (_, { companyId }) => {
    // FY chain overview
    const fys = queryAll<{ id: number; name: string; start_date: string; end_date: string }>(
      'SELECT id, name, start_date, end_date FROM financial_years WHERE company_id = ? ORDER BY start_date',
      [companyId]
    );
    return fys.map(fy => {
      const carryForwards = queryAll<{ customer_id: number; amount: number; balance_type: string }>(
        'SELECT customer_id, amount, balance_type FROM fy_carry_forwards WHERE to_fy_id = ?',
        [fy.id]
      );
      return {
        ...fy,
        carryForwardCount: carryForwards.length,
        totalCarryForward: carryForwards.reduce((s, c) => s + c.amount, 0)
      };
    });
  });

  // Merged DB Import (premium feature)
  ipcMain.handle(IPC_CHANNELS['mdb:check-merged-db'], (_, { dbPath }) => {
    if (!isPremiumFeature('legacy_import')) return { error: 'Premium feature. Upgrade at Settings > License.' };
    return checkMergedDb(dbPath);
  });
  ipcMain.handle(IPC_CHANNELS['mdb:import-merged'], async (_, payload) => {
    if (!isPremiumFeature('legacy_import')) return { success: false, error: 'Premium feature. Upgrade at Settings > License.' };
    const result = await importFromMergedDb(payload.dbPath, payload.companyId, payload.options);
    if (result.success && !result.dryRun) {
      executeWrite(
        `INSERT INTO legacy_import_log (file_path, company_id, imported_products, imported_customers, imported_invoices, imported_ledger, imported_opening_balances)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          payload.dbPath,
          payload.companyId,
          result.imported.products,
          result.imported.customers,
          result.imported.invoices,
          result.imported.ledger,
          result.imported.openingBalances
        ]
      );
    }
    return result;
  });

  // Run legacy merge script
  ipcMain.handle(IPC_CHANNELS['mdb:run-merge'], async (event) => {
    const scriptPath = join(__dirname, '..', '..', 'scripts', 'merge-legacy-data.mjs');
    const cwd = join(__dirname, '..', '..');

    if (!existsSync(scriptPath)) {
      return { success: false, error: `Merge script not found at ${scriptPath}` };
    }

    return new Promise((resolve) => {
      const output: string[] = [];
      const child = spawn('node', [scriptPath], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });

      child.stdout.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          output.push(line);
          try {
            event.sender.send(IPC_CHANNELS['mdb:merge-progress'], { line });
          } catch { }
        }
      });

      child.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        output.push(text);
        try {
          event.sender.send(IPC_CHANNELS['mdb:merge-progress'], { line: text, isError: true });
        } catch { }
      });

      child.on('close', (code) => {
        const mergedDbPath = join(cwd, 'Upload', 'Merged', 'merged.db');
        let dbInfo: MergedDbInfo | { error: string } = { exists: false, sourceFiles: 0, totalLedger: 0, totalAccount: 0, totalItems: 0, totalInventory: 0, totalBillMaster: 0, fileSize: 0 };
        if (existsSync(mergedDbPath)) {
          dbInfo = checkMergedDb(mergedDbPath);
        }
        resolve({
          success: code === 0,
          exitCode: code,
          output,
          dbInfo,
          mergedDbPath: existsSync(mergedDbPath) ? mergedDbPath : null
        });
      });

      child.on('error', (err) => {
        resolve({ success: false, error: err.message, output });
      });
    });
  });

  // Preview merged DB import (dry run)
  ipcMain.handle(IPC_CHANNELS['mdb:preview-merged'], async (_, payload) => {
    return importFromMergedDb(payload.dbPath, payload.companyId, { ...payload.options, dryRun: true });
  });

  // Default merged DB path
  ipcMain.handle(IPC_CHANNELS['mdb:get-path'], () =>
    join(__dirname, '..', '..', 'Upload', 'Merged', 'merged.db')
  );
}
