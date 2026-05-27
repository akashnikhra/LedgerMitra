import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@shared/constants';

contextBridge.exposeInMainWorld('electronAPI', {
  login: (username: string, password: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['auth:login'], { username, password }),
  logout: () => ipcRenderer.invoke(IPC_CHANNELS['auth:logout']),
  getCurrentUser: () => ipcRenderer.invoke(IPC_CHANNELS['auth:get-user']),
  changePassword: (currentPassword: string, newPassword: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['auth:change-password'], { currentPassword, newPassword }),

  getCompanies: () => ipcRenderer.invoke(IPC_CHANNELS['company:list']),
  createCompany: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS['company:create'], data),

  getFinancialYears: (companyId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS['fy:list'], companyId),
  getActiveFinancialYear: (companyId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS['fy:get-active'], companyId),
  createFinancialYear: (data: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS['fy:create'], data),
  setActiveFinancialYear: (id: number, companyId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS['fy:set-active'], { id, companyId }),

  setWorkspace: (companyId: number, fyId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS['workspace:set'], { companyId, fyId }),

  getCustomers: () => ipcRenderer.invoke(IPC_CHANNELS['customer:list']),
  getCustomer: (id: number) => ipcRenderer.invoke(IPC_CHANNELS['customer:get'], id),
  createCustomer: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS['customer:create'], data),
  updateCustomer: (id: number, data: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS['customer:update'], { id, data }),
  deleteCustomer: (id: number) => ipcRenderer.invoke(IPC_CHANNELS['customer:delete'], id),

  getSuppliers: () => ipcRenderer.invoke(IPC_CHANNELS['supplier:list']),
  getSupplier: (id: number) => ipcRenderer.invoke(IPC_CHANNELS['supplier:get'], id),
  createSupplier: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS['supplier:create'], data),
  updateSupplier: (id: number, data: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS['supplier:update'], { id, data }),
  deleteSupplier: (id: number) => ipcRenderer.invoke(IPC_CHANNELS['supplier:delete'], id),

  getProducts: () => ipcRenderer.invoke(IPC_CHANNELS['product:list']),
  createProduct: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS['product:create'], data),
  getProduct: (id: number) => ipcRenderer.invoke(IPC_CHANNELS['product:get'], id),
  updateProduct: (id: number, data: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS['product:update'], { id, data }),
  deleteProduct: (id: number) => ipcRenderer.invoke(IPC_CHANNELS['product:delete'], id),
  getInvoices: (params?: { fyId?: number; type?: string }) => ipcRenderer.invoke(IPC_CHANNELS['invoice:list'], params),
  getInvoice: (id: number) => ipcRenderer.invoke(IPC_CHANNELS['invoice:get'], id),
  getInvoiceWithItems: (id: number) => ipcRenderer.invoke(IPC_CHANNELS['invoice:get-with-items'], id),
  getInvoiceItems: (invoiceId: number) => ipcRenderer.invoke(IPC_CHANNELS['invoice:item:list'], invoiceId),
  createInvoice: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS['invoice:create'], data),
  updateInvoice: (id: number, data: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS['invoice:update'], { id, data }),
  deleteInvoice: (id: number) => ipcRenderer.invoke(IPC_CHANNELS['invoice:delete'], id),

  getPurchaseInvoices: (fyId?: number) => ipcRenderer.invoke(IPC_CHANNELS['purchase-invoice:list'], fyId),
  getPurchaseInvoice: (id: number) => ipcRenderer.invoke(IPC_CHANNELS['purchase-invoice:get'], id),
  createPurchaseInvoice: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS['purchase-invoice:create'], data),
  deletePurchaseInvoice: (id: number) => ipcRenderer.invoke(IPC_CHANNELS['purchase-invoice:delete'], id),
  getPurchaseInvoiceItems: (invoiceId: number) => ipcRenderer.invoke(IPC_CHANNELS['purchase-invoice:item:list'], invoiceId),

  getLedger: (customerId?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS['ledger:list'], customerId),
  addPayment: (data: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS['ledger:add-payment'], data),
  addPurchasePayment: (data: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS['ledger:add-purchase-payment'], data),

  getDashboardStats: () => ipcRenderer.invoke(IPC_CHANNELS['dashboard:stats']),
  getDashboardInsights: () => ipcRenderer.invoke(IPC_CHANNELS['dashboard:insights']),

  mdbListFiles: () => ipcRenderer.invoke(IPC_CHANNELS['mdb:list-files']),
  mdbLegacyPaths: () => ipcRenderer.invoke(IPC_CHANNELS['mdb:legacy-paths']),
  mdbAnalyze: (filePath: string, password: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['mdb:analyze'], { filePath, password }),
  mdbImport: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS['mdb:import'], payload),
  mdbCreateCompany: (name: string, gstin?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['mdb:create-company'], { name, gstin }),
  mdbGetCompanies: () => ipcRenderer.invoke(IPC_CHANNELS['mdb:get-companies']),
  mdbCreateFy: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS['mdb:create-fy'], data),
  mdbListFy: (companyId: number) => ipcRenderer.invoke(IPC_CHANNELS['mdb:list-fy'], companyId),
  mdbCheckImportStatus: (filePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['mdb:check-import-status'], { filePath }),
  mdbAnalyzeFys: (filePath: string, password: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['mdb:analyze-fys'], { filePath, password }),
  mdbImportFy: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS['mdb:import-fy'], payload),
  getImportLogs: (companyId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS['import:list-logs'], { companyId }),
  getCustomerBalanceTrace: (customerId: number, companyId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS['trace:customer-balance'], { customerId, companyId }),

  // Merged DB Import
  getMergedDbPath: () => ipcRenderer.invoke(IPC_CHANNELS['mdb:get-path']),
  checkMergedDb: (dbPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['mdb:check-merged-db'], { dbPath }),
  importMergedDb: (payload: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS['mdb:import-merged'], payload),
  runMergeLegacy: () =>
    ipcRenderer.invoke(IPC_CHANNELS['mdb:run-merge']),
  previewImportMergedDb: (payload: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS['mdb:preview-merged'], payload),
  onMergeProgress: (cb: (data: { line: string; isError?: boolean }) => void) =>
    ipcRenderer.on(IPC_CHANNELS['mdb:merge-progress'], (_, data) => cb(data)),
  removeMergeProgressListener: () =>
    ipcRenderer.removeAllListeners(IPC_CHANNELS['mdb:merge-progress']),

  // Receipts
  getReceipts: (filters?: unknown) => ipcRenderer.invoke(IPC_CHANNELS['receipt:list'], filters),
  getReceipt: (id: number) => ipcRenderer.invoke(IPC_CHANNELS['receipt:get'], id),
  createReceipt: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS['receipt:create'], data),
  deleteReceipt: (id: number) => ipcRenderer.invoke(IPC_CHANNELS['receipt:delete'], id),
  getOutstandingInvoices: (customerId: number) => ipcRenderer.invoke(IPC_CHANNELS['receipt:outstanding'], customerId),
  generateReceiptNo: (date: string) => ipcRenderer.invoke(IPC_CHANNELS['receipt:generate-no'], date),
  autoAllocateReceipt: (customerId: number, amount: number) => ipcRenderer.invoke(IPC_CHANNELS['receipt:auto-allocate'], { customerId, amount }),

  // Ledger (extended)
  getCustomerLedger: (customerId: number, dateFrom?: string, dateTo?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['ledger:customer'], { customerId, dateFrom, dateTo }),
  getYearLedger: (fyId: number, customerId?: number, entryType?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['ledger:year'], { fyId, customerId, entryType }),
  getInvoiceLedger: (invoiceId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS['ledger:by-invoice'], invoiceId),
  getLedgerSummary: (fyId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS['ledger:summary'], fyId),

  // Print
  printInvoice: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS['print:invoice'], data),
  printReceipt: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS['print:receipt'], data),
  printLedger: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS['print:ledger'], data),
  savePdf: (html: string, defaultName: string) =>
    ipcRenderer.invoke(IPC_CHANNELS['print:save-pdf-dialog'], { html, defaultName }),

  // Settings
  getSetting: (key: string) => ipcRenderer.invoke(IPC_CHANNELS['setting:get'], key),
  setSetting: (key: string, value: string) => ipcRenderer.invoke(IPC_CHANNELS['setting:set'], { key, value }),

  // Backup
  exportBackup: () => ipcRenderer.invoke(IPC_CHANNELS['backup:export']),
  importBackup: () => ipcRenderer.invoke(IPC_CHANNELS['backup:import']),

  // WhatsApp
  whatsappStatus: () => ipcRenderer.invoke(IPC_CHANNELS['whatsapp:status']),
  whatsappReconnect: () => ipcRenderer.invoke(IPC_CHANNELS['whatsapp:reconnect']),
  whatsappDisconnect: () => ipcRenderer.invoke(IPC_CHANNELS['whatsapp:disconnect']),
  whatsappSend: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS['whatsapp:send'], data),
  onWhatsAppStatus: (cb: (data: unknown) => void) => ipcRenderer.on('whatsapp:status', (_, data) => cb(data)),
  onWhatsAppQr: (cb: (data: unknown) => void) => ipcRenderer.on('whatsapp:qr', (_, data) => cb(data))
});
